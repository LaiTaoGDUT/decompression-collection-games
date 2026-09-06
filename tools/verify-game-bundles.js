const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const gamesRoot = path.join(root, 'assets', 'games');
const gameAssetsRoot = path.join(root, 'assets', 'game-assets');
const expectedSubpackageConfigId = '00mTKQ64hMUZEoY95Dbj9L';
const expectedRemoteConfigId = '00gRa8kX2LmP4qN6sT9vWy';
const minimumBundleLoadTimeoutMs = 60000;
const verifiedBundles = [];
const bundleRoots = new Map();
const resourceBundleRoots = new Map();

function resolveSceneRef(objects, reference) {
    if (!reference || typeof reference.__id__ !== 'number') return undefined;
    return objects[reference.__id__];
}

function assertSceneCameraBindings(scenePath, gameId) {
    const objects = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
    const canvases = objects.filter((object) => object.__type__ === 'cc.Canvas');
    // 3D-only development scenes may intentionally omit Canvas; if a Canvas is
    // present, however, its camera binding is part of the mandatory contract.
    if (canvases.length === 0) return;

    for (const canvas of canvases) {
        const canvasNode = resolveSceneRef(objects, canvas.node);
        const camera = resolveSceneRef(objects, canvas._cameraComponent);
        assert(canvasNode, `${gameId} Canvas must reference a scene node.`);
        assert(camera?.__type__ === 'cc.Camera', `${gameId} Canvas camera must resolve to cc.Camera.`);
        const cameraNode = resolveSceneRef(objects, camera.node);
        assert(cameraNode, `${gameId} Canvas camera must reference a scene node.`);
        assert.strictEqual(
            cameraNode._layer,
            canvasNode._layer,
            `${gameId} Canvas and its UI camera must use the same layer.`,
        );
        assert(
            (camera._visibility & canvasNode._layer) === canvasNode._layer,
            `${gameId} UI camera visibility must include the Canvas layer.`,
        );
        assert.strictEqual(
            camera._projection,
            0,
            `${gameId} UI camera must use orthographic projection.`,
        );
    }

    const entry = objects.find((object) => object.worldCamera);
    if (!entry) return;

    const canvas = canvases[0];
    const canvasNode = resolveSceneRef(objects, canvas.node);
    const uiCamera = resolveSceneRef(objects, canvas._cameraComponent);
    const worldCamera = resolveSceneRef(objects, entry.worldCamera);
    const worldCameraNode = resolveSceneRef(objects, worldCamera?.node);
    assert(worldCamera?.__type__ === 'cc.Camera', `${gameId} WorldCamera must resolve to cc.Camera.`);
    assert(worldCameraNode, `${gameId} WorldCamera must reference a scene node.`);
    assert.notStrictEqual(
        worldCameraNode._layer,
        canvasNode._layer,
        `${gameId} world and UI layers must be isolated.`,
    );
    assert(
        (worldCamera._visibility & worldCameraNode._layer) === worldCameraNode._layer,
        `${gameId} WorldCamera visibility must include its world layer.`,
    );
    assert.strictEqual(worldCamera._projection, 0, `${gameId} WorldCamera must be orthographic.`);
    assert(
        (uiCamera._clearFlags & 1) === 0,
        `${gameId} UI camera must preserve the world color buffer.`,
    );
    assert(
        (worldCamera._clearFlags & 1) === 1,
        `${gameId} WorldCamera must clear its own color buffer.`,
    );
}

function assertManifestAsset(logicalPath, gameId, gameRoot) {
    if (typeof logicalPath !== 'string' || !logicalPath.startsWith('visual/')) return;
    const withoutTextureSubAsset = logicalPath.replace(/\/texture$/, '');
    const candidates = [
        path.join(gameRoot, withoutTextureSubAsset),
        path.join(root, 'assets', 'lobby', withoutTextureSubAsset),
    ];
    const extensions = ['', '.png', '.jpg', '.jpeg', '.webp'];
    assert(
        candidates.some((candidate) => extensions.some((extension) => fs.existsSync(candidate + extension))),
        `${gameId} manifest asset ${logicalPath} must resolve to a source image in its Bundle or lobby Bundle.`,
    );
}

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

function walkFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(entryPath));
        else files.push(entryPath);
    }
    return files;
}

function assertRemoteResourceBundle(metaPath, expectedBundleName) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const config = meta.userData ?? {};
    assert.strictEqual(config.isBundle, true, `${expectedBundleName} must be an Asset Bundle.`);
    assert.strictEqual(config.isSubpackage, false, `${expectedBundleName} must not be a WeChat subpackage.`);
    assert.strictEqual(
        config.bundleConfigID,
        expectedRemoteConfigId,
        `${expectedBundleName} must use the project remote-resource configuration.`,
    );
    assert.strictEqual(config.bundleName, expectedBundleName);
    assert(
        config.priority > 1,
        `${expectedBundleName} priority must be higher than its code Bundle.`,
    );
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
    assert(
        !fs.existsSync(path.join(gameRoot, 'visual')),
        `${config.bundleName} must not retain a nested visual resource directory.`,
    );
    bundleRoots.set(config.bundleName, gameRoot);
}

assert(verifiedBundles.length > 0, 'No game bundles were found.');

for (const entry of fs.readdirSync(gameAssetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const resourceRoot = path.join(gameAssetsRoot, entry.name);
    const metaPath = path.join(gameAssetsRoot, `${entry.name}.meta`);
    assert(fs.existsSync(metaPath), `${entry.name} resource Bundle must have a directory meta file.`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const bundleName = meta.userData?.bundleName;
    assert.match(bundleName ?? '', /^game-.+-assets$/, `${entry.name} must use a game-*-assets bundle name.`);
    assertRemoteResourceBundle(metaPath, bundleName);
    assert(fs.existsSync(path.join(resourceRoot, 'visual')), `${bundleName} must contain its visual root.`);
    const prohibited = walkFiles(resourceRoot).filter((file) => /\.(?:ts|js|scene|prefab)$/.test(file));
    assert.deepStrictEqual(
        prohibited,
        [],
        `${bundleName} must contain no scripts, scenes, or Prefabs: ${prohibited.join(', ')}`,
    );
    resourceBundleRoots.set(bundleName, resourceRoot);
}

const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'assets', 'resources', 'configs', 'games.json'),
    'utf8',
));
assert(Array.isArray(manifest.games), 'Game manifest must contain a games array.');
assert.strictEqual(manifest.schemaVersion, 3, 'Game manifest schemaVersion must be 3.');
for (const game of manifest.games) {
    const gameRoot = bundleRoots.get(game.bundle);
    assert(gameRoot, `${game.id} manifest bundle ${game.bundle} must be registered as a game Bundle.`);
    const resourceRoot = resourceBundleRoots.get(game.resourceBundle);
    assert(
        resourceRoot,
        `${game.id} resourceBundle ${game.resourceBundle} must be registered as a remote resource Bundle.`,
    );
    assert.notStrictEqual(game.bundle, game.resourceBundle, `${game.id} code and resource Bundles must differ.`);
    assertSceneCameraBindings(
        path.join(gameRoot, `${game.scene}.scene`),
        game.id,
    );
    assertManifestAsset(game.cover, game.id, gameRoot);
}
assert.strictEqual(
    resourceBundleRoots.size,
    manifest.games.length,
    'Every remote game resource Bundle must belong to exactly one manifest entry.',
);

const appConfig = JSON.parse(fs.readFileSync(
    path.join(root, 'assets', 'resources', 'configs', 'app.json'),
    'utf8',
));
assert(
    appConfig.timeouts?.bundleLoadMs >= minimumBundleLoadTimeoutMs,
    `Bundle loading must allow at least ${minimumBundleLoadTimeoutMs} ms for WeChat subpackage downloads.`,
);

const appConfigSource = fs.readFileSync(
    path.join(root, 'assets', 'app', 'AppConfig.ts'),
    'utf8',
);
const assetServiceSource = fs.readFileSync(
    path.join(root, 'assets', 'services', 'asset', 'AssetService.ts'),
    'utf8',
);
assert(
    appConfigSource.includes(`bundleLoadMs: ${minimumBundleLoadTimeoutMs}`),
    'AppConfig fallback bundle timeout must match the production configuration.',
);
assert(
    assetServiceSource.includes(`DEFAULT_BUNDLE_LOAD_TIMEOUT_MS = ${minimumBundleLoadTimeoutMs}`),
    'AssetService default bundle timeout must protect slow WeChat subpackage downloads.',
);
assert(
    assetServiceSource.includes('bundle.loadDir('),
    'AssetService must fully load the remote resource directory before game startup.',
);

console.log(
    `game_bundles=passed, subpackages=${verifiedBundles.join(',')}, `
    + `remote=${Array.from(resourceBundleRoots.keys()).join(',')}`,
);
