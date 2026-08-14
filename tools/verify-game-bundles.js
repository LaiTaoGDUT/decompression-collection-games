const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const gamesRoot = path.join(root, 'assets', 'games');
const expectedSubpackageConfigId = '00mTKQ64hMUZEoY95Dbj9L';
const verifiedBundles = [];

function assertSubpackage(metaPath, expectedBundleName) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const config = meta.userData ?? {};
    assert.strictEqual(
        config.isBundle,
        true,
        `${expectedBundleName} must be an Asset Bundle.`,
    );
    assert.strictEqual(
        config.isSubpackage,
        true,
        `${expectedBundleName} must be a WeChat subpackage.`,
    );
    assert.strictEqual(
        config.bundleConfigID,
        expectedSubpackageConfigId,
        `${expectedBundleName} must use the project subpackage bundle configuration.`,
    );
    assert.strictEqual(
        config.bundleName,
        expectedBundleName,
        `${expectedBundleName} must keep its expected bundle name.`,
    );

    verifiedBundles.push(config.bundleName);
}

assertSubpackage(path.join(root, 'assets', 'lobby.meta'), 'lobby');

for (const entry of fs.readdirSync(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const gameRoot = path.join(gamesRoot, entry.name);
    const gameFiles = fs.readdirSync(gameRoot).filter((name) => name !== '.gitkeep');
    if (gameFiles.length === 0) continue;

    const metaPath = path.join(gamesRoot, `${entry.name}.meta`);
    assert(
        fs.existsSync(metaPath),
        `${entry.name} must have a directory meta file.`,
    );

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const config = meta.userData ?? {};
    assert.match(
        config.bundleName ?? '',
        /^game-/,
        `${entry.name} must use a game-* bundle name.`,
    );
    assertSubpackage(metaPath, config.bundleName);
}

assert(verifiedBundles.length > 0, 'No game bundles were found.');
console.log(`game_bundles=passed, subpackages=${verifiedBundles.join(',')}`);
