const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const OUTPUT_DIR = path.resolve('assets/games/twenty48/visual/ui');

const specs = [
    ['t48-popup-panel-system-v1.png', 520, 700, false],
    ['t48-popup-panel-result-v1.png', 520, 730, true],
    ['t48-popup-panel-2048-v1.png', 548, 780, false],
    ['t48-popup-panel-4096-v1.png', 548, 780, true],
    ['t48-popup-button-cyan-v1.png', 430, 82, false],
    ['t48-popup-button-amber-v1.png', 430, 82, true],
    ['t48-popup-button-violet-v1.png', 430, 82, false],
    ['t48-popup-score-cyan-v1.png', 410, 72, true],
    ['t48-popup-score-amber-v1.png', 400, 120, true],
];

function isLightCheckerPixel(data, offset) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const highest = Math.max(red, green, blue);
    const lowest = Math.min(red, green, blue);
    return lowest >= 180 && highest - lowest <= 34;
}

function clearConnectedCheckerboard(image) {
    const { data, width, height } = image.bitmap;
    const visited = new Uint8Array(width * height);
    const queue = new Uint32Array(width * height);
    let head = 0;
    let tail = 0;

    const enqueue = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = y * width + x;
        if (visited[index]) return;
        const offset = index * 4;
        if (!isLightCheckerPixel(data, offset)) return;
        visited[index] = 1;
        queue[tail] = index;
        tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
        enqueue(0, y);
        enqueue(width - 1, y);
    }

    while (head < tail) {
        const index = queue[head];
        head += 1;
        data[index * 4 + 3] = 0;
        const x = index % width;
        const y = Math.floor(index / width);
        enqueue(x - 1, y);
        enqueue(x + 1, y);
        enqueue(x, y - 1);
        enqueue(x, y + 1);
    }
}

function cropToVisibleBounds(image) {
    const { data, width, height } = image.bitmap;
    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= 4) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    if (right < left || bottom < top) throw new Error('Generated asset has no visible pixels.');
    const margin = Math.max(4, Math.round(Math.min(width, height) * 0.008));
    left = Math.max(0, left - margin);
    right = Math.min(width - 1, right + margin);
    top = Math.max(0, top - margin);
    bottom = Math.min(height - 1, bottom + margin);
    image.crop(left, top, right - left + 1, bottom - top + 1);
}

async function main() {
    const sources = process.argv.slice(2);
    if (sources.length !== specs.length) {
        throw new Error(`Expected ${specs.length} source images, received ${sources.length}.`);
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    for (let index = 0; index < specs.length; index += 1) {
        const [filename, width, height, clearCheckerboard] = specs[index];
        const image = await Jimp.read(sources[index]);
        if (clearCheckerboard) clearConnectedCheckerboard(image);
        cropToVisibleBounds(image);
        image.resize(width, height, Jimp.RESIZE_BICUBIC);
        await image.writeAsync(path.join(OUTPUT_DIR, filename));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
