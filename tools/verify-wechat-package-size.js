const assert = require('assert');
const fs = require('fs');
const path = require('path');

const maxMainPackageBytes = 4 * 1024 * 1024;
const buildRoot = path.resolve(__dirname, '..', 'build');
const expectedSubpackages = [
    'game-chess-endless',
    'game-2048',
    'game-watermelon',
    'game-sliding-puzzle',
];

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
    `WeChat output is stale: missing subpackage ${name}; rebuild with the current Cocos bundle configuration.`,
));

function directorySize(directory, excludedDirectoryName) {
    let total = 0;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name === excludedDirectoryName) {
            continue;
        }

        const entryPath = path.join(directory, entry.name);
        total += entry.isDirectory()
            ? directorySize(entryPath)
            : fs.statSync(entryPath).size;
    }

    return total;
}

const mainPackageBytes = directorySize(root, 'subpackages');
const mainPackageKiB = mainPackageBytes / 1024;
const headroomKiB = (maxMainPackageBytes - mainPackageBytes) / 1024;

assert(
    mainPackageBytes <= maxMainPackageBytes,
    `WeChat main package is ${mainPackageKiB.toFixed(2)} KiB; maximum is 4096 KiB.`,
);

console.log(
    `wechat_main_package=passed, output=${path.basename(root)}, size=${mainPackageKiB.toFixed(2)}KiB, `
    + `headroom=${headroomKiB.toFixed(2)}KiB`,
);
