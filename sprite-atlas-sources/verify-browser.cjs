const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/usr/local/lib/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'local/manual-atlas-verification');
fs.mkdirSync(output, { recursive: true });
const groups = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'))).games;
const mappings = Object.fromEntries(Object.keys(groups).map(game => {
    const script = fs.readFileSync(path.join(root, 'assets/games', game, 'scripts/PackedSpritePaths.ts'), 'utf8');
    return [game, JSON.parse(script.slice(script.indexOf('Object.freeze(') + 14, script.lastIndexOf(');')))];
}));
(async () => {
    const browser = await chromium.launch({ headless: true });
    const errors = [], results = [];
    try {
        const page = await browser.newPage({ viewport: { width: 750, height: 1414 } });
        page.on('pageerror', error => errors.push(error.stack));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(process.env.COCOS_PREVIEW_URL || 'http://192.168.0.104:7456', { waitUntil: 'networkidle' });
        await page.waitForFunction(async () => {
            const app = (await System.import('cc')).js.getClassByName('App')?.current;
            return app && Array.from(app.services.services.values()).some(s => s.currentState === 'lobby');
        }, {}, { timeout: 60000 });
        for (const game of Object.keys(groups)) {
            const result = await page.evaluate(async ({ game, paths }) => {
                const cc = await System.import('cc');
                const services = Array.from(cc.js.getClassByName('App').current.services.services.values());
                const runtime = services.find(s => typeof s.enterGame === 'function');
                const registry = services.find(s => typeof s.getById === 'function');
                const id = game === 'twenty48' ? 'game2048' : game;
                const manifest = registry.getById(id);
                await runtime.enterGame(manifest);
                if (!runtime.currentEntry) throw Error(`Entry missing: ${id}`);
                const activate = async () => {
                    const entry = runtime.currentEntry;
                    entry.enabled = false;
                    if (game === 'doodle-jump') {
                        if (entry.tutorialActive) entry.completeTutorial();
                        entry.startPlaying();
                        entry.renderSimulation();
                    }
                    if (game === 'sliding-puzzle') await entry.startRound();
                };
                await activate();
                const assets = runtime.assets;
                const bundle = cc.assetManager.getBundle(manifest.resourceBundle);
                // Bubble assets retain the existing lazy region preparation.
                if (game === 'bubble-shooter') {
                    for (const region of ['cloud', 'ocean', 'toy', 'magic']) {
                        await assets.prepareBundle(manifest.resourceBundle, `visual/regions/${region}`, undefined, { excludeAudio: true });
                    }
                }
                const unique = Array.from(new Set(paths));
                for (const path of unique) {
                    const frame = await assets.loadAsset(manifest.resourceBundle, path, cc.SpriteFrame);
                    if (!frame?.texture || frame.rect.width <= 0 || frame.rect.height <= 0) throw Error(`Invalid frame: ${path}`);
                    if (frame.rect.x + frame.rect.width > frame.texture.width || frame.rect.y + frame.rect.height > frame.texture.height) throw Error(`Out-of-texture frame: ${path}`);
                }
                const owned = Array.from(assets.runtimeAssets.entries()).filter(([, owner]) => owner === manifest.resourceBundle).map(([asset]) => asset);
                const paused = runtime.openPauseMenu();
                if (paused) await runtime.resumeFromPause();
                const restarted = runtime.openPauseMenu();
                if (restarted) {
                    await runtime.restartFromPause();
                    await activate();
                    for (const path of unique) {
                        // Bubble restarts replace the entire resource Bundle; other
                        // games can reuse it. Resolve through the current owner.
                        const currentBundle = cc.assetManager.getBundle(manifest.resourceBundle);
                        const frame = currentBundle === bundle
                            ? currentBundle.get(path, cc.SpriteFrame)
                            : await assets.loadAsset(manifest.resourceBundle, path, cc.SpriteFrame);
                        if (!frame?.isValid || !frame.texture?.isValid) throw Error(`Restart destroyed a source frame: ${path}`);
                    }
                }
                return { id, frames: unique.length, owned: owned.length, paused, restarted, bundleName: manifest.resourceBundle };
            }, { game, paths: Object.values(mappings[game]) });
            await page.screenshot({ path: path.join(output, `${game}.png`) });
            const cleanup = await page.evaluate(async bundleName => {
                const cc = await System.import('cc');
                const runtime = Array.from(cc.js.getClassByName('App').current.services.services.values()).find(s => typeof s.enterGame === 'function');
                await runtime.exitGame();
                return {
                    bundleReleased: !cc.assetManager.getBundle(bundleName),
                    ownedRemaining: Array.from(runtime.assets.runtimeAssets.values()).filter(owner => owner === bundleName).length,
                    retainedRemaining: runtime.assets.retainedAssets.get(bundleName)?.size ?? 0,
                };
            }, result.bundleName);
            assert(cleanup.bundleReleased && cleanup.ownedRemaining === 0 && cleanup.retainedRemaining === 0, game + ' leaked resources');
            results.push({ ...result, ...cleanup });
            console.log(JSON.stringify(results.at(-1)));
        }
        assert.equal(errors.length, 0, errors.join('\n'));
        fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ results, errors }, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
