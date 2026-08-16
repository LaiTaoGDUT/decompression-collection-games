const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const gameRoot = path.join(root, 'assets/games/chess-endless');
const lobbyRoots = [
    path.join(root, 'assets/lobby/visual/covers/chess-endless'),
    path.join(root, 'assets/lobby/visual/icons/chess-endless'),
];

function portable(value) {
    return path.relative(root, value).replaceAll('\\', '/');
}

function uuidFor(filename) {
    const hex = crypto.createHash('sha256').update(`chess-endless-v1:${portable(filename)}`).digest('hex').slice(0, 32).split('');
    hex[12] = '4';
    hex[16] = (8 + (parseInt(hex[16], 16) % 4)).toString(16);
    const value = hex.join('');
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function writeJson(filename, value) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function directoryMeta(directory, userData = {}) {
    writeJson(`${directory}.meta`, {
        ver: '1.2.0',
        importer: 'directory',
        imported: true,
        uuid: uuidFor(directory),
        files: [],
        subMetas: {},
        userData,
    });
}

function imageMeta(filename) {
    const uuid = uuidFor(filename);
    const displayName = path.basename(filename, path.extname(filename));
    writeJson(`${filename}.meta`, {
        ver: '1.0.27',
        importer: 'image',
        imported: true,
        uuid,
        files: ['.json', path.extname(filename)],
        subMetas: {
            '6c48a': {
                importer: 'texture',
                uuid: `${uuid}@6c48a`,
                displayName,
                id: '6c48a',
                name: 'texture',
                userData: {
                    wrapModeS: 'clamp-to-edge',
                    wrapModeT: 'clamp-to-edge',
                    minfilter: 'linear',
                    magfilter: 'linear',
                    mipfilter: 'none',
                    anisotropy: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: uuid,
                    visible: false,
                },
                ver: '1.0.22',
                imported: true,
                files: ['.json'],
                subMetas: {},
            },
        },
        userData: {
            type: 'texture',
            fixAlphaTransparencyArtifacts: true,
            hasAlpha: true,
            redirect: `${uuid}@6c48a`,
        },
    });
}

function audioMeta(filename) {
    writeJson(`${filename}.meta`, {
        ver: '1.0.0',
        importer: 'audio-clip',
        imported: true,
        uuid: uuidFor(filename),
        files: ['.json', '.mp3'],
        subMetas: {},
        userData: { downloadMode: 0 },
    });
}

function typescriptMeta(filename) {
    writeJson(`${filename}.meta`, {
        ver: '4.0.24',
        importer: 'typescript',
        imported: true,
        uuid: uuidFor(filename),
        files: [],
        subMetas: {},
        userData: {},
    });
}

const dirs = [gameRoot];
for (const child of fs.readdirSync(gameRoot, { withFileTypes: true })) {
    if (child.isDirectory()) dirs.push(path.join(gameRoot, child.name));
}
for (const top of dirs.slice(1)) {
    for (const child of fs.readdirSync(top, { withFileTypes: true })) {
        if (child.isDirectory()) dirs.push(path.join(top, child.name));
    }
}
for (const directory of lobbyRoots) dirs.push(directory);

directoryMeta(gameRoot, {
    compressionType: {},
    bundleName: 'game-chess-endless',
    isSubpackage: true,
    isRemoteBundle: {},
    priority: 1,
    bundleConfigID: '00mTKQ64hMUZEoY95Dbj9L',
    isBundle: true,
});
dirs.filter((directory) => directory !== gameRoot).forEach((directory) => directoryMeta(directory));

const script = path.join(gameRoot, 'scripts/ChessEndlessGame.ts');
const model = path.join(gameRoot, 'scripts/ChessEndlessModel.ts');
typescriptMeta(script);
typescriptMeta(model);

for (const directory of dirs) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isFile() && entry.name.endsWith('.png')) imageMeta(filename);
        if (entry.isFile() && entry.name.endsWith('.mp3')) audioMeta(filename);
    }
}

const sourceScene = path.join(root, 'assets/games/twenty48/scenes/Game2048.scene');
const sourceScriptMeta = JSON.parse(fs.readFileSync(path.join(root, 'assets/games/twenty48/scripts/Game2048Game.ts.meta'), 'utf8'));
const sceneDirectory = path.join(gameRoot, 'scenes');
fs.mkdirSync(sceneDirectory, { recursive: true });
directoryMeta(sceneDirectory);
const sceneFile = path.join(sceneDirectory, 'ChessEndless.scene');
const sceneUuid = uuidFor(sceneFile);
const scene = JSON.parse(fs.readFileSync(sourceScene, 'utf8'));
scene[0]._name = 'ChessEndless';
scene[1]._name = 'ChessEndless';
scene[1]._id = sceneUuid;

const key = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function compressUuid(uuid) {
    const source = uuid.replace(/-/g, '');
    let output = source.slice(0, 5);
    for (let index = 5; index < 32; index += 3) {
        output += key[parseInt(source[index], 16) * 4 + (parseInt(source[index + 1], 16) >> 2)];
        output += key[(parseInt(source[index + 1], 16) & 3) * 16 + parseInt(source[index + 2], 16)];
    }
    return output;
}
const previousType = compressUuid(sourceScriptMeta.uuid);
const nextType = compressUuid(uuidFor(script));
for (const record of scene) {
    if (record.__type__ === previousType) record.__type__ = nextType;
}
writeJson(sceneFile, scene);
writeJson(`${sceneFile}.meta`, {
    ver: '1.1.50',
    importer: 'scene',
    imported: true,
    uuid: sceneUuid,
    files: ['.json'],
    subMetas: {},
    userData: {},
});

console.log(`chess_metadata=generated, directories=${dirs.length + 1}, component=${nextType}, scene=${portable(sceneFile)}`);
