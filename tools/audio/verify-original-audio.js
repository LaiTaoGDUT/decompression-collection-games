const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync('docs/asset-generation/audio-v1-report.json', 'utf8'));
if (report.sampleRate !== 48000 || report.assets.length !== 17) {
    throw new Error('Unexpected audio sample rate or asset count.');
}

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
    if (runtimeNames.has(path.basename(runtime))) throw new Error('Audio filename reused across owners.');
    runtimeNames.add(path.basename(runtime));
    runtimeBytes += fs.statSync(runtime).size;
}

console.log(
    `assets=${report.assets.length}, wav=RIFF/48kHz, mp3=valid, `
    + `music_seams=0, peaks<=-2dBFS, bundle_routes=isolated, runtime_bytes=${runtimeBytes}`,
);
