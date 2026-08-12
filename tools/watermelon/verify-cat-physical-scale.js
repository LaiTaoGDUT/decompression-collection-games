const assert = require('assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const baseRadii = [24, 30, 38, 46, 56, 68, 82, 98, 116, 136, 158];
const expectedScale = 1.12;
const config = JSON.parse(fs.readFileSync('assets/games/watermelon/configs/gameplay.json', 'utf8'));
const catalog = fs.readFileSync('assets/games/watermelon/scripts/FruitCatalog.ts', 'utf8');
const body = fs.readFileSync('assets/games/watermelon/scripts/FruitBody.ts', 'utf8');
const game = fs.readFileSync('assets/games/watermelon/scripts/WatermelonGame.ts', 'utf8');
const runtimeRoot = path.resolve('assets/games/watermelon/visual/cats/frames-c6');
const frameNames = [
    'cat-08-blue-scottish-fold-idle-1-c8-v1.png',
    'cat-08-blue-scottish-fold-idle-2-c8-v1.png',
    'cat-08-blue-scottish-fold-fall-c8-v1.png',
];

assert.strictEqual(config.fruits.length, baseRadii.length);
config.fruits.forEach((fruit, level) => {
    assert.strictEqual(fruit.radius, Number((baseRadii[level] * expectedScale).toFixed(2)));
});
assert(catalog.includes("['blue-scottish-fold', '蓝灰折耳'"));
assert(catalog.includes("'c8-v1'"));
assert(!catalog.includes('CAT_VISUAL_SCALE'));
assert(!body.includes('CAT_VISUAL_SCALE'));
assert(!game.includes('CAT_VISUAL_SCALE'));
assert(body.includes('collider.radius = config.radius'));
assert(body.includes('const visualSize = config.radius * 2 / CAT_TOKEN_VISIBLE_DIAMETER_RATIO'));
assert(game.includes('const previewSize = diameter / CAT_TOKEN_VISIBLE_DIAMETER_RATIO'));
assert.strictEqual(
    fs.readdirSync(runtimeRoot).filter((name) => name.startsWith('cat-08-silver-tabby-')).length,
    0,
);

(async () => {
    let expectedAlpha;
    for (const frameName of frameNames) {
        const absolute = path.join(runtimeRoot, frameName);
        assert(fs.existsSync(absolute), `Missing ${frameName}.`);
        assert(fs.existsSync(`${absolute}.meta`), `Missing ${frameName}.meta.`);
        const { data, info } = await sharp(absolute)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        assert.strictEqual(info.width, 256);
        assert.strictEqual(info.height, 256);
        assert.strictEqual(info.channels, 4);
        const alpha = Buffer.alloc(256 * 256);
        for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3];
        if (expectedAlpha) assert(alpha.equals(expectedAlpha), `${frameName} alpha differs.`);
        else expectedAlpha = alpha;
        assert.strictEqual(alpha[0], 0);
        assert.strictEqual(alpha[128 * 256 + 128], 255);
    }

    console.log(
        'cat08=blue-scottish-fold, frames=3, distinct_identity=folded-ears+solid-blue, '
        + 'physical_scale=1.12, collider=radius, visual=collider-matched, alpha=identical',
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
