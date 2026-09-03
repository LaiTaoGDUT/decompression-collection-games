const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const maxMainPackageBytes = 4 * 1024 * 1024;
const maxUploadedPackageBytes = 30 * 1024 * 1024;
const buildRoot = path.join(projectRoot, 'build');
const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, 'assets', 'resources', 'configs', 'games.json'),
    'utf8',
));
const expectedSubpackages = ['lobby', ...manifest.games.map((game) => game.bundle)];
const expectedRemoteBundles = manifest.games.map((game) => game.resourceBundle);

const candidates = fs.existsSync(buildRoot)
    ? fs.readdirSync(buildRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^wechatgame(?:-\d+)?$/.test(entry.name))
        .map((entry) => {
            const directory = path.join(buildRoot, entry.name);
            const gameJsonPath = path.join(directory, 'game.json');
            if (!fs.existsSync(gameJsonPath)) return undefined;
            const gameJson = JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
            const names = new Set((gameJson.subpackages ?? []).map((subpackage) => subpackage.name));
            return {
                directory,
                gameJson,
                complete: expectedSubpackages.every((name) => names.has(name)),
                modifiedAt: fs.statSync(gameJsonPath).mtimeMs,
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.modifiedAt - left.modifiedAt)
    : [];

const selected = candidates.find((candidate) => candidate.complete) ?? candidates[0];
const root = selected?.directory ?? path.join(buildRoot, 'wechatgame');

assert(fs.existsSync(root), 'build/wechatgame does not exist; build the project first.');

const gameJsonPath = path.join(root, 'game.json');
assert(fs.existsSync(gameJsonPath), 'build/wechatgame/game.json is missing; rebuild the project.');
const gameJson = selected?.gameJson ?? JSON.parse(fs.readFileSync(gameJsonPath, 'utf8'));
const actualSubpackages = new Set((gameJson.subpackages ?? []).map((entry) => entry.name));
expectedSubpackages.forEach((name) => assert(
    actualSubpackages.has(name),
    `WeChat output is stale: missing local subpackage ${name}; rebuild with the current Cocos bundle configuration.`,
));
expectedRemoteBundles.forEach((name) => {
    assert(
        !actualSubpackages.has(name),
        `${name} must be remote and must not appear in game.json subpackages.`,
    );
    assert(
        fs.existsSync(path.join(root, 'remote', name)),
        `WeChat output is stale: missing remote Bundle ${name}.`,
    );
});

function directorySize(directory, excludedDirectoryNames = []) {
    if (!fs.existsSync(directory)) return 0;
    let total = 0;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && excludedDirectoryNames.includes(entry.name)) continue;
        const entryPath = path.join(directory, entry.name);
        total += entry.isDirectory()
            ? directorySize(entryPath)
            : fs.statSync(entryPath).size;
    }

    return total;
}

const mainPackageBytes = directorySize(root, ['subpackages', 'remote']);
const subpackageBytes = directorySize(path.join(root, 'subpackages'));
const uploadedPackageBytes = mainPackageBytes + subpackageBytes;
const remoteBundleBytes = directorySize(path.join(root, 'remote'));

assert(
    mainPackageBytes <= maxMainPackageBytes,
    `WeChat main package is ${(mainPackageBytes / 1024).toFixed(2)} KiB; maximum is 4096 KiB.`,
);
assert(
    uploadedPackageBytes <= maxUploadedPackageBytes,
    `WeChat uploaded main + subpackages are ${(uploadedPackageBytes / 1024 / 1024).toFixed(2)} MiB; maximum is 30 MiB.`,
);

const settingsFiles = fs.readdirSync(path.join(root, 'src'))
    .filter((name) => /^settings(?:\.[a-f0-9]+)?\.json$/.test(name));
assert.strictEqual(settingsFiles.length, 1, 'WeChat output must contain exactly one settings JSON file.');
const builtSettings = JSON.parse(fs.readFileSync(
    path.join(root, 'src', settingsFiles[0]),
    'utf8',
));
expectedRemoteBundles.forEach((name) => {
    const version = builtSettings.assets?.bundleVers?.[name];
    assert.match(
        version ?? '',
        /^[a-f0-9]+$/,
        `${name} must have an MD5 version in built settings.`,
    );
    assert(
        fs.existsSync(path.join(root, 'remote', name, `config.${version}.json`)),
        `${name} must output a versioned remote config file.`,
    );
});

console.log(
    `wechat_package=passed, output=${path.basename(root)}, `
    + `main=${(mainPackageBytes / 1024 / 1024).toFixed(2)}MiB, `
    + `subpackages=${(subpackageBytes / 1024 / 1024).toFixed(2)}MiB, `
    + `uploaded=${(uploadedPackageBytes / 1024 / 1024).toFixed(2)}MiB, `
    + `remote=${(remoteBundleBytes / 1024 / 1024).toFixed(2)}MiB`,
);
