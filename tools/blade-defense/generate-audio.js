const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SAMPLE_RATE = 48000;
const OUTPUT = path.resolve('assets/games/blade-defense/visual/audio');
const MASTERS = path.resolve('audio_sources/generated/v1/blade-defense/master');
const SEED = 0xB1ADE202;

function randomSource(seed) {
    return () => {
        let value = seed += 0x6D2B79F5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function track(duration) {
    const length = Math.round(duration * SAMPLE_RATE);
    return { duration, left: new Float32Array(length), right: new Float32Array(length) };
}

function envelope(time, duration, attack = 0.01, release = 0.18) {
    return Math.max(0, Math.min(1, time / attack, (duration - time) / release));
}

function tone(target, start, duration, from, gain, options = {}) {
    const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const end = Math.min(target.left.length, Math.floor((start + duration) * SAMPLE_RATE));
    const to = options.to ?? from;
    const pan = options.pan ?? 0;
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    let phase = 0;
    for (let index = begin; index < end; index += 1) {
        const time = index / SAMPLE_RATE - start;
        const progress = time / duration;
        const frequency = from * ((to / from) ** progress);
        phase += Math.PI * 2 * frequency / SAMPLE_RATE;
        let wave = Math.sin(phase);
        if (options.triangle) wave = 2 / Math.PI * Math.asin(Math.sin(phase));
        if (options.pluck) wave += 0.28 * Math.sin(phase * 2) + 0.1 * Math.sin(phase * 3);
        const value = wave * gain * envelope(
            time,
            duration,
            options.attack ?? 0.008,
            options.release ?? Math.min(0.35, duration * 0.6),
        );
        target.left[index] += value * leftGain;
        target.right[index] += value * rightGain;
    }
}

function noise(target, start, duration, gain, seed, pan = 0) {
    const random = randomSource(seed);
    const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const end = Math.min(target.left.length, Math.floor((start + duration) * SAMPLE_RATE));
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    let filtered = 0;
    for (let index = begin; index < end; index += 1) {
        const time = index / SAMPLE_RATE - start;
        filtered = filtered * 0.91 + (random() * 2 - 1) * 0.09;
        const value = filtered * gain * envelope(time, duration, 0.004, duration * 0.74);
        target.left[index] += value * leftGain;
        target.right[index] += value * rightGain;
    }
}

function normalize(target, peak = 0.5) {
    let current = 0;
    for (let index = 0; index < target.left.length; index += 1) {
        current = Math.max(current, Math.abs(target.left[index]), Math.abs(target.right[index]));
    }
    const scale = current > 0 ? Math.min(1, peak / current) : 1;
    for (let index = 0; index < target.left.length; index += 1) {
        target.left[index] *= scale;
        target.right[index] *= scale;
    }
}

function music() {
    const result = track(24);
    const roots = [110, 130.81, 146.83, 123.47, 110, 98];
    roots.forEach((root, bar) => {
        const start = bar * 4;
        [1, 1.5, 2, 2.5].forEach((ratio, voice) => tone(
            result,
            start,
            3.96,
            root * ratio,
            voice === 0 ? 0.038 : 0.024,
            { attack: 0.38, release: 0.52, pan: (voice - 1.5) * 0.18 },
        ));
        [0.25, 1.25, 2.25, 3.25].forEach((offset, note) => {
            const melody = [440, 523.25, 659.25, 587.33, 493.88, 392];
            tone(result, start + offset, 0.42, melody[(bar + note) % melody.length], 0.044, {
                pluck: true,
                release: 0.34,
                pan: note % 2 ? 0.28 : -0.28,
            });
        });
        noise(result, start + 0.02, 0.1, 0.034, SEED + bar, -0.12);
        noise(result, start + 2.02, 0.1, 0.026, SEED + 30 + bar, 0.12);
    });
    normalize(result, 0.34);
    return result;
}

function cue(name) {
    const durations = {
        button: 0.14,
        hit: 0.11,
        chest: 0.48,
        merge: 0.62,
        bonus: 0.92,
        life: 0.52,
        failure: 1.08,
        record: 1.12,
    };
    const result = track(durations[name]);
    if (name === 'button') {
        tone(result, 0, 0.12, 620, 0.14, { to: 860, triangle: true });
    } else if (name === 'hit') {
        noise(result, 0, 0.09, 0.17, SEED + 1);
        tone(result, 0, 0.1, 240, 0.08, { to: 390 });
    } else if (name === 'chest') {
        [659.25, 783.99, 987.77].forEach((frequency, index) => tone(
            result, index * 0.07, 0.38, frequency, 0.12, { pluck: true, pan: index % 2 ? 0.25 : -0.25 },
        ));
    } else if (name === 'merge') {
        [392, 523.25, 659.25].forEach((frequency, index) => tone(
            result, index * 0.1, 0.46, frequency, 0.13, { pluck: true, pan: index % 2 ? 0.22 : -0.22 },
        ));
    } else if (name === 'bonus') {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(
            result, index * 0.11, 0.58, frequency, 0.14, { pluck: true, pan: index % 2 ? 0.3 : -0.3 },
        ));
        tone(result, 0.06, 0.78, 160, 0.055, { to: 640, release: 0.35 });
    } else if (name === 'life') {
        tone(result, 0, 0.46, 190, 0.16, { to: 92, triangle: true, release: 0.3 });
        noise(result, 0.02, 0.25, 0.12, SEED + 2);
    } else if (name === 'failure') {
        [[392, 293.66], [293.66, 220], [220, 146.83]].forEach(([from, to], index) => tone(
            result, index * 0.18, 0.65, from, 0.12 - index * 0.018,
            { to, triangle: true, pan: index % 2 ? 0.2 : -0.2, release: 0.42 },
        ));
    } else if (name === 'record') {
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => tone(
            result, index * 0.11, 0.6, frequency, 0.12, { pluck: true, pan: index % 2 ? 0.26 : -0.26 },
        ));
    }
    normalize(result, name === 'hit' ? 0.28 : 0.52);
    return result;
}

function int16(value) {
    const limited = Math.max(-1, Math.min(1, value));
    return limited < 0 ? Math.round(limited * 32768) : Math.round(limited * 32767);
}

function writeWav(source, filename) {
    const bytes = 44 + source.left.length * 4;
    const buffer = Buffer.alloc(bytes);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(bytes - 8, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(2, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
    buffer.writeUInt16LE(4, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(bytes - 44, 40);
    for (let index = 0; index < source.left.length; index += 1) {
        buffer.writeInt16LE(int16(source.left[index]), 44 + index * 4);
        buffer.writeInt16LE(int16(source.right[index]), 46 + index * 4);
    }
    fs.writeFileSync(filename, buffer);
}

function writeMp3(wavFilename, filename, bitrate) {
    execFileSync('/opt/homebrew/bin/ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', wavFilename,
        '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`, filename,
    ]);
}

fs.mkdirSync(OUTPUT, { recursive: true });
fs.mkdirSync(MASTERS, { recursive: true });
const assets = [
    ['bd1-moon-guard-loop-v1', music(), true],
    ...['button', 'hit', 'chest', 'merge', 'bonus', 'life', 'failure', 'record']
        .map((name) => [`bd1-${name}-v1`, cue(name), false]),
];
for (const [name, source, isMusic] of assets) {
    const master = path.join(MASTERS, `${name}.wav`);
    writeWav(source, master);
    writeMp3(master, path.join(OUTPUT, `${name}.mp3`), isMusic ? 96 : 64);
}
console.log(`blade_defense_audio=passed, assets=${assets.length}, sampleRate=${SAMPLE_RATE}`);
