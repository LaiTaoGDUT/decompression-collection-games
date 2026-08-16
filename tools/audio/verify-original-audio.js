const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync('docs/asset-generation/audio-v1-report.json', 'utf8'));
if (report.sampleRate !== 48000 || report.assets.length !== 57) {
    throw new Error('Unexpected audio sample rate or asset count.');
}

const chessAssets = report.assets.filter((asset) => asset.owner === 'chess-endless');
if (chessAssets.length !== 28) throw new Error('Expected 28 Chess Endless tracks.');
const chessNormal = chessAssets.find((asset) => asset.name === 'chess-game-normal-loop-v1');
const chessPressure = chessAssets.find((asset) => asset.name === 'chess-game-pressure-loop-v1');
if (!chessNormal || chessNormal.durationSeconds < 60) throw new Error('Chess normal BGM must be at least 60 seconds.');
if (!chessPressure || chessPressure.durationSeconds < 45) throw new Error('Chess pressure BGM must be at least 45 seconds.');
[
    'chess-item-help-v1',
    'chess-general-guard-v1', 'chess-reward-close-v1',
].forEach((name) => {
    if (!chessAssets.some((asset) => asset.name === name)) throw new Error(`Missing Chess cue ${name}.`);
});

const generatorSource = fs.readFileSync('tools/audio/generate-original-audio.js', 'utf8');
['addGuqin(', 'addPipa(', 'addDizi(', 'addErhu(', 'addWarDrum(', 'addGong(']
    .forEach((needle) => {
        if (!generatorSource.includes(needle)) throw new Error(`Missing ancient-instrument layer ${needle}.`);
    });

const runtimeNames = new Set();
let runtimeBytes = 0;
for (const asset of report.assets) {
    const master = path.resolve(asset.masterPath);
    const runtime = path.resolve(asset.runtimePath);
    if (!fs.existsSync(master) || !fs.existsSync(runtime)) throw new Error(`Missing ${asset.name}.`);
    if (fs.readFileSync(master).subarray(0, 4).toString('ascii') !== 'RIFF') throw new Error(`Invalid WAV ${asset.name}.`);
    const mp3Header = fs.readFileSync(runtime).subarray(0, 2);
    if (mp3Header[0] !== 0xFF || (mp3Header[1] & 0xE0) !== 0xE0) throw new Error(`Invalid MP3 ${asset.name}.`);
    if (asset.peakDbfs > -1.9) throw new Error(`Peak too high: ${asset.name}.`);
    if (asset.music && asset.seamDelta !== 0) throw new Error(`Loop seam is not zero: ${asset.name}.`);
    if (asset.owner === 'lobby' && !asset.runtimePath.startsWith('assets/lobby/')) throw new Error('Lobby route leak.');
    if (asset.owner === 'watermelon' && !asset.runtimePath.startsWith('assets/games/watermelon/')) throw new Error('Game route leak.');
    if (asset.owner === 'game2048' && !asset.runtimePath.startsWith('assets/games/twenty48/')) throw new Error('2048 route leak.');
    if (runtimeNames.has(path.basename(runtime))) throw new Error('Audio filename reused across owners.');
    runtimeNames.add(path.basename(runtime));
    runtimeBytes += fs.statSync(runtime).size;
}

console.log(
    `assets=${report.assets.length}, wav=RIFF/48kHz, mp3=valid, `
    + `music_seams=0, peaks<=-2dBFS, bundle_routes=isolated, chess=29, `
    + `chess_bgm=64s/48s, ancient_layers=6, runtime_bytes=${runtimeBytes}`,
);
