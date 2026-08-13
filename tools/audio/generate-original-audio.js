const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const lameContext = {};
let lamejs;
try {
    vm.runInNewContext(
        fs.readFileSync(
            path.join(path.dirname(require.resolve('lamejs/package.json')), 'lame.min.js'),
            'utf8',
        ),
        lameContext,
    );
    lamejs = lameContext.lamejs;
} catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') throw error;
}

const SAMPLE_RATE = 48000;
const SEED = 0x51A7E202;
const sourceRoot = path.resolve('audio_sources/generated/v1');
const lobbyRuntime = path.resolve('assets/lobby/visual/audio');
const gameRuntime = path.resolve('assets/games/watermelon/visual/audio');
const game2048Runtime = path.resolve('assets/games/twenty48/visual/audio');
const reportPath = path.resolve('docs/asset-generation/audio-v1-report.json');
for (const folder of [sourceRoot, lobbyRuntime, gameRuntime, game2048Runtime]) fs.mkdirSync(folder, { recursive: true });

function mulberry32(seed) {
    return () => {
        let value = seed += 0x6D2B79F5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function createTrack(duration) {
    const length = Math.round(duration * SAMPLE_RATE);
    return { left: new Float32Array(length), right: new Float32Array(length), duration };
}

function envelope(time, duration, attack = 0.04, release = 0.28) {
    const inGain = Math.min(1, time / Math.max(0.001, attack));
    const outGain = Math.min(1, (duration - time) / Math.max(0.001, release));
    return Math.max(0, Math.min(inGain, outGain));
}

function addTone(track, start, duration, frequency, amplitude, options = {}) {
    const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const end = Math.min(track.left.length, Math.floor((start + duration) * SAMPLE_RATE));
    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    const attack = options.attack ?? Math.min(0.05, duration * 0.15);
    const release = options.release ?? Math.min(0.35, duration * 0.45);
    const harmonic = options.harmonic ?? 0;
    const kind = options.kind ?? 'sine';

    for (let index = begin; index < end; index += 1) {
        const time = index / SAMPLE_RATE - start;
        const phase = Math.PI * 2 * frequency * time;
        let wave = Math.sin(phase);
        if (kind === 'triangle') wave = (2 / Math.PI) * Math.asin(Math.sin(phase));
        if (kind === 'pluck') wave = Math.sin(phase) + 0.32 * Math.sin(phase * 2) + 0.12 * Math.sin(phase * 3);
        if (harmonic) wave += harmonic * Math.sin(phase * 2.01);
        const gain = amplitude * envelope(time, duration, attack, release);
        track.left[index] += wave * gain * leftGain;
        track.right[index] += wave * gain * rightGain;
    }
}

function addSweep(track, start, duration, startFrequency, endFrequency, amplitude, options = {}) {
    const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const end = Math.min(track.left.length, Math.floor((start + duration) * SAMPLE_RATE));
    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    let phase = 0;
    for (let index = begin; index < end; index += 1) {
        const time = index / SAMPLE_RATE - start;
        const progress = Math.min(1, time / Math.max(0.001, duration));
        const frequency = startFrequency * ((endFrequency / startFrequency) ** progress);
        phase += Math.PI * 2 * frequency / SAMPLE_RATE;
        const wave = options.kind === 'triangle'
            ? (2 / Math.PI) * Math.asin(Math.sin(phase))
            : Math.sin(phase);
        const gain = amplitude * envelope(
            time,
            duration,
            options.attack ?? 0.008,
            options.release ?? duration * 0.52,
        );
        track.left[index] += wave * gain * leftGain;
        track.right[index] += wave * gain * rightGain;
    }
}

function addNoise(track, start, duration, amplitude, seed, options = {}) {
    const random = mulberry32(seed);
    const begin = Math.max(0, Math.floor(start * SAMPLE_RATE));
    const end = Math.min(track.left.length, Math.floor((start + duration) * SAMPLE_RATE));
    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
    const leftGain = Math.sqrt((1 - pan) / 2);
    const rightGain = Math.sqrt((1 + pan) / 2);
    const smoothing = options.smoothing ?? 0.75;
    let filtered = 0;
    for (let index = begin; index < end; index += 1) {
        const time = index / SAMPLE_RATE - start;
        filtered = filtered * smoothing + (random() * 2 - 1) * (1 - smoothing);
        const gain = amplitude * envelope(time, duration, options.attack ?? 0.004, options.release ?? duration * 0.65);
        track.left[index] += filtered * gain * leftGain;
        track.right[index] += filtered * gain * rightGain;
    }
}

function addChime(track, start, frequency, amplitude, pan = 0) {
    addTone(track, start, 0.72, frequency, amplitude, { kind: 'sine', attack: 0.006, release: 0.62, pan, harmonic: 0.18 });
}

function createLobbyMusic() {
    const track = createTrack(32);
    const chords = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
    chords.concat(chords).forEach((chord, bar) => {
        chord.forEach((frequency, index) => addTone(track, bar * 4, 3.92, frequency, 0.048, {
            attack: 0.55, release: 0.72, pan: (index - 1) * 0.34, harmonic: 0.08,
        }));
    });
    const melody = [440, 493.88, 554.37, 659.25, 554.37, 493.88, 440, 369.99];
    for (let beat = 0; beat < 32; beat += 1) {
        if (beat % 4 !== 3) addChime(track, beat, melody[beat % melody.length], 0.055, beat % 2 ? 0.22 : -0.22);
    }
    // V2 keeps the original soft-light foundation and adds restrained depth:
    // a warm bass line, an answering upper phrase, and sparse gallery shimmer.
    const bass = [110, 98, 87.31, 98, 110, 123.47, 87.31, 98];
    bass.forEach((frequency, bar) => addTone(track, bar * 4, 3.88, frequency, 0.025, {
        kind: 'triangle', attack: 0.7, release: 0.9, pan: bar % 2 ? 0.08 : -0.08,
    }));
    const answer = [659.25, 739.99, 659.25, 554.37, 493.88, 554.37, 659.25, 493.88];
    answer.forEach((frequency, index) => {
        const start = 1.5 + index * 4;
        addChime(track, start, frequency, 0.026, index % 2 ? 0.34 : -0.34);
        addTone(track, start + 0.42, 1.15, frequency / 2, 0.018, {
            attack: 0.12, release: 0.86, pan: index % 2 ? -0.18 : 0.18, harmonic: 0.12,
        });
    });
    for (let bar = 0; bar < 8; bar += 1) {
        addNoise(track, bar * 4 + 2.72, 0.42, 0.015, SEED + 320 + bar, {
            smoothing: 0.965, attack: 0.08, release: 0.3, pan: bar % 2 ? 0.48 : -0.48,
        });
    }
    for (let beat = 0; beat < 64; beat += 1) addNoise(track, beat * 0.5, 0.08, 0.013, SEED + beat, { smoothing: 0.91, pan: (beat % 3 - 1) * 0.3 });
    return track;
}

function createGameMusic() {
    const track = createTrack(32);
    const chords = [
        [130.81, 196, 261.63, 329.63],
        [110, 164.81, 220, 261.63],
        [87.31, 130.81, 174.61, 220],
        [98, 146.83, 196, 246.94],
    ];
    for (let bar = 0; bar < 8; bar += 1) {
        const start = bar * 4;
        const chord = chords[bar % chords.length];
        chord.forEach((frequency, index) => addTone(track, start, 3.94, frequency, 0.027, {
            attack: 0.62,
            release: 0.78,
            pan: (index - 1.5) * 0.19,
            harmonic: index > 1 ? 0.07 : 0.02,
        }));
        addTone(track, start, 3.86, chord[0] / 2, 0.016, {
            kind: 'triangle', attack: 0.72, release: 0.86, pan: bar % 2 ? 0.06 : -0.06,
        });
    }

    const motif = [392, 440, 523.25, 440, 329.63, 392, 493.88, 392];
    for (let bar = 0; bar < 8; bar += 1) {
        [0.35, 1.28, 2.24, 3.18].forEach((offset, note) => {
            const frequency = motif[(bar + note * 2) % motif.length];
            addTone(track, bar * 4 + offset, 0.48, frequency, 0.043, {
                kind: 'pluck', attack: 0.006, release: 0.4,
                pan: note % 2 ? 0.24 : -0.24, harmonic: 0.08,
            });
        });
        if (bar % 2 === 1) {
            addChime(track, bar * 4 + 1.78, motif[(bar + 3) % motif.length] * 1.5, 0.025, 0.34);
            addTone(track, bar * 4 + 2.55, 0.92, motif[(bar + 5) % motif.length] / 2, 0.018, {
                attack: 0.12, release: 0.68, pan: -0.28,
            });
        }
    }

    for (let beat = 0; beat < 32; beat += 1) {
        addNoise(track, beat + 0.04, 0.12, beat % 4 === 2 ? 0.02 : 0.012, SEED + 900 + beat, {
            smoothing: 0.955,
            attack: 0.018,
            release: 0.085,
            pan: beat % 2 ? 0.25 : -0.25,
        });
    }
    return track;
}

function create2048Music() {
    const track = createTrack(24);
    const roots = [73.42, 82.41, 98, 110, 73.42, 87.31];
    roots.forEach((root, bar) => {
        const start = bar * 4;
        [1, 1.5, 2, 3].forEach((ratio, index) => addTone(track, start, 3.95, root * ratio, 0.025, {
            attack: 0.38,
            release: 0.58,
            pan: (index - 1.5) * 0.2,
            harmonic: 0.16,
        }));
        addSweep(track, start, 3.8, root * 2, root * 3, 0.018, {
            attack: 0.45,
            release: 0.72,
            pan: bar % 2 ? 0.32 : -0.32,
        });
    });
    const sequence = [293.66, 369.99, 440, 554.37, 440, 369.99, 329.63, 493.88];
    for (let step = 0; step < 96; step += 1) {
        if (step % 4 !== 3) {
            addTone(track, step * 0.25, 0.17, sequence[step % sequence.length], 0.026, {
                kind: 'pluck',
                attack: 0.003,
                release: 0.13,
                pan: step % 2 ? 0.28 : -0.28,
            });
        }
        if (step % 8 === 0) addNoise(track, step * 0.25, 0.06, 0.014, SEED + 2048 + step, { smoothing: 0.82 });
    }
    return track;
}

function create2048DangerMusic() {
    const track = createTrack(12);
    const roots = [73.42, 77.78, 87.31, 92.5];
    for (let bar = 0; bar < 6; bar += 1) {
        const start = bar * 2;
        const root = roots[bar % roots.length];
        [1, 1.5, 2].forEach((ratio, voice) => addTone(track, start, 1.96, root * ratio, 0.031, {
            attack: 0.12,
            release: 0.22,
            pan: (voice - 1) * 0.25,
            harmonic: 0.2,
        }));
        addSweep(track, start, 1.86, root * 2.2, root * 4.2, 0.025, {
            attack: 0.08,
            release: 0.3,
            pan: bar % 2 ? 0.3 : -0.3,
        });
    }
    const alarm = [440, 554.37, 659.25, 554.37, 493.88, 622.25, 739.99, 622.25];
    for (let step = 0; step < 48; step += 1) {
        const start = step * 0.25;
        addTone(track, start, 0.13, alarm[step % alarm.length], 0.033, {
            kind: 'pluck',
            attack: 0.002,
            release: 0.1,
            pan: step % 2 ? 0.34 : -0.34,
        });
        if (step % 2 === 0) {
            addTone(track, start, 0.18, 65.41, 0.055, { kind: 'triangle', attack: 0.004, release: 0.14 });
            addNoise(track, start + 0.02, 0.07, 0.022, SEED + 4096 + step, { smoothing: 0.88 });
        }
    }
    return track;
}

function create2048Cue(name) {
    const durations = {
        button: 0.12,
        move: 0.14,
        invalid: 0.16,
        spawn: 0.18,
        merge2048: 0.32,
        combo: 0.52,
        target: 1.2,
        gameover: 0.9,
        record2048: 1.05,
    };
    const track = createTrack(durations[name]);
    const seed = SEED + 2048 + [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    if (name === 'button') {
        addTone(track, 0, 0.1, 780, 0.12, { kind: 'triangle', release: 0.08 });
        addTone(track, 0.025, 0.09, 1170, 0.05, { release: 0.07 });
    }
    if (name === 'move') {
        addSweep(track, 0, 0.13, 360, 620, 0.1, { attack: 0.004, release: 0.09, pan: -0.12 });
        addNoise(track, 0, 0.08, 0.08, seed, { smoothing: 0.9, pan: 0.16 });
    }
    if (name === 'invalid') {
        addTone(track, 0, 0.14, 155, 0.11, { kind: 'triangle', release: 0.11 });
        addTone(track, 0.035, 0.11, 146, 0.07, { release: 0.08 });
    }
    if (name === 'spawn') {
        addSweep(track, 0.01, 0.15, 620, 980, 0.1, { release: 0.12, pan: 0.2 });
        addTone(track, 0.04, 0.12, 1240, 0.055, { release: 0.09, pan: -0.2 });
    }
    if (name === 'merge2048') {
        [392, 587.33].forEach((frequency, index) => addTone(track, index * 0.055, 0.26, frequency, 0.12, {
            kind: 'pluck', release: 0.2, pan: index ? 0.18 : -0.18,
        }));
        addSweep(track, 0.04, 0.24, 210, 330, 0.055, { release: 0.18 });
    }
    if (name === 'combo') {
        [392, 523.25, 659.25, 783.99].forEach((frequency, index) => addTone(track, index * 0.075, 0.34, frequency, 0.105, {
            kind: 'pluck', release: 0.27, pan: index % 2 ? 0.24 : -0.24,
        }));
    }
    if (name === 'target') {
        [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, index) => addChime(track, index * 0.12, frequency, 0.12, index % 2 ? 0.25 : -0.25));
        addSweep(track, 0.1, 0.94, 110, 440, 0.06, { attack: 0.16, release: 0.38 });
    }
    if (name === 'gameover') {
        [[392, 293.66], [293.66, 220], [220, 146.83]].forEach(([from, to], index) => addSweep(
            track, index * 0.15, 0.5, from, to, 0.09 - index * 0.014,
            { kind: 'triangle', attack: 0.02, release: 0.34, pan: index % 2 ? 0.2 : -0.2 },
        ));
        addNoise(track, 0.45, 0.38, 0.08, seed, { smoothing: 0.97, release: 0.3 });
    }
    if (name === 'record2048') {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => addChime(track, index * 0.12, frequency, 0.115, index % 2 ? 0.3 : -0.3));
        addSweep(track, 0.12, 0.8, 220, 880, 0.045, { attack: 0.1, release: 0.32 });
    }
    return track;
}

function createCue(name) {
    const durations = {
        lobby_button: 0.16, lobby_popup: 0.34, lobby_toggle: 0.2,
        game_button: 0.14, drop: 0.15, collision_1: 0.1, collision_2: 0.11, collision_3: 0.12,
        fold: 0.3, merge: 0.48, chain: 0.62, danger: 1.05, failure: 1.2, continue: 0.72, record: 1.15,
    };
    const track = createTrack(durations[name]);
    const seed = SEED + [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    if (name === 'lobby_button') { addTone(track, 0, 0.14, 620, 0.16, { release: 0.12 }); addTone(track, 0.03, 0.12, 930, 0.08, { release: 0.1 }); }
    if (name === 'lobby_popup') { addTone(track, 0, 0.31, 330, 0.11, { attack: 0.06, release: 0.2 }); addTone(track, 0.07, 0.25, 494, 0.08, { release: 0.2 }); }
    if (name === 'lobby_toggle') { addTone(track, 0, 0.18, 740, 0.13, { kind: 'triangle', release: 0.14 }); }
    if (name === 'game_button') { addNoise(track, 0, 0.12, 0.22, seed, { smoothing: 0.82 }); addTone(track, 0.01, 0.12, 410, 0.08, { release: 0.1 }); }
    if (name === 'drop') {
        addNoise(track, 0, 0.13, 0.1, seed, {
            smoothing: 0.968, attack: 0.003, release: 0.11, pan: -0.06,
        });
        addSweep(track, 0.006, 0.12, 540, 340, 0.055, {
            kind: 'sine', attack: 0.004, release: 0.095, pan: 0.08,
        });
        addTone(track, 0.035, 0.09, 660, 0.018, {
            attack: 0.006, release: 0.075, pan: 0.16,
        });
    }
    if (name.startsWith('collision_')) {
        const variant = Number(name.at(-1));
        addNoise(track, 0, track.duration, 0.11, seed, {
            smoothing: 0.94 + variant * 0.008,
            attack: 0.004,
            release: track.duration * 0.72,
            pan: variant === 2 ? 0.12 : variant === 3 ? -0.12 : 0,
        });
        addTone(track, 0.008, track.duration - 0.008, 220 + variant * 18, 0.025, {
            kind: 'sine', attack: 0.008, release: track.duration * 0.8,
        });
    }
    if (name === 'fold') { addNoise(track, 0, 0.28, 0.3, seed, { smoothing: 0.93 }); addTone(track, 0.08, 0.2, 510, 0.08, { kind: 'triangle', release: 0.15 }); }
    if (name === 'merge') { addNoise(track, 0, 0.25, 0.23, seed, { smoothing: 0.9 }); addChime(track, 0.08, 523.25, 0.16, -0.15); addChime(track, 0.16, 659.25, 0.12, 0.18); }
    if (name === 'chain') { [523.25, 659.25, 783.99].forEach((f, i) => addChime(track, i * 0.11, f, 0.13, i % 2 ? 0.25 : -0.2)); addNoise(track, 0, 0.36, 0.13, seed, { smoothing: 0.9 }); }
    if (name === 'danger') {
        [0, 0.24, 0.48, 0.72].forEach((start, index) => {
            addTone(track, start, 0.2, index % 2 ? 82.41 : 73.42, 0.2, {
                kind: 'triangle', attack: 0.006, release: 0.15,
            });
            addSweep(track, start + 0.02, 0.2, 620, index % 2 ? 1180 : 980, 0.11, {
                attack: 0.004, release: 0.13, pan: index % 2 ? 0.28 : -0.28,
            });
            addNoise(track, start, 0.16, 0.22, seed + index * 31, {
                smoothing: 0.82, release: 0.1, pan: index % 2 ? -0.22 : 0.22,
            });
        });
        addSweep(track, 0.18, 0.78, 145, 310, 0.075, {
            kind: 'triangle', attack: 0.09, release: 0.24,
        });
    }
    if (name === 'failure') {
        // A completely new direction: loose paper falls away, followed by a gentle low ending.
        [0.02, 0.2, 0.4].forEach((start, index) => addNoise(
            track,
            start,
            0.34,
            0.26 - index * 0.035,
            seed + 700 + index * 53,
            { smoothing: 0.94, attack: 0.012, release: 0.27, pan: [-0.5, 0.42, -0.18][index] },
        ));
        [[493.88, 392], [392, 293.66], [293.66, 220]].forEach(([from, to], index) => {
            addSweep(track, 0.08 + index * 0.2, 0.42, from, to, 0.07 - index * 0.01, {
                attack: 0.018, release: 0.32, pan: index % 2 ? 0.2 : -0.2,
            });
        });
        addTone(track, 0.63, 0.54, 196, 0.052, { attack: 0.08, release: 0.4, pan: -0.12 });
        addTone(track, 0.7, 0.47, 146.83, 0.045, { attack: 0.08, release: 0.38, pan: 0.12 });
    }
    if (name === 'continue') { addNoise(track, 0, 0.5, 0.18, seed, { smoothing: 0.92 }); [329.63, 440, 587.33].forEach((f, i) => addChime(track, 0.08 + i * 0.12, f, 0.12)); }
    if (name === 'record') { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => addChime(track, i * 0.14, f, 0.13, i % 2 ? 0.2 : -0.2)); addNoise(track, 0.1, 0.75, 0.1, seed, { smoothing: 0.88 }); }
    return track;
}

function analyzeAndNormalize(track, targetLufs, maxPeakDb) {
    let sum = 0;
    let peak = 0;
    for (let index = 0; index < track.left.length; index += 1) {
        sum += (track.left[index] ** 2 + track.right[index] ** 2) / 2;
        peak = Math.max(peak, Math.abs(track.left[index]), Math.abs(track.right[index]));
    }
    const rms = Math.sqrt(sum / track.left.length) || 1e-9;
    const targetRms = 10 ** ((targetLufs + 0.691) / 20);
    const peakLimit = 10 ** (maxPeakDb / 20);
    const gain = Math.min(targetRms / rms, peakLimit / Math.max(peak, 1e-9));
    for (let index = 0; index < track.left.length; index += 1) {
        track.left[index] *= gain;
        track.right[index] *= gain;
    }

    sum = 0; peak = 0;
    for (let index = 0; index < track.left.length; index += 1) {
        sum += (track.left[index] ** 2 + track.right[index] ** 2) / 2;
        peak = Math.max(peak, Math.abs(track.left[index]), Math.abs(track.right[index]));
    }
    const finalRms = Math.sqrt(sum / track.left.length) || 1e-9;
    return {
        approximateLufs: Number((-0.691 + 20 * Math.log10(finalRms)).toFixed(2)),
        peakDbfs: Number((20 * Math.log10(Math.max(peak, 1e-9))).toFixed(2)),
        seamDelta: Number(Math.max(
            Math.abs(track.left[0] - track.left.at(-1)),
            Math.abs(track.right[0] - track.right.at(-1)),
        ).toFixed(7)),
    };
}

function applyBoundaryFade(track, seconds) {
    const samples = Math.min(Math.floor(seconds * SAMPLE_RATE), Math.floor(track.left.length / 2));
    for (let index = 0; index < samples; index += 1) {
        const gain = index / Math.max(1, samples - 1);
        const tail = track.left.length - 1 - index;
        track.left[index] *= gain;
        track.right[index] *= gain;
        track.left[tail] *= gain;
        track.right[tail] *= gain;
    }
}

function floatToInt16(value) {
    const clamped = Math.max(-1, Math.min(1, value));
    return Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767);
}

function writeWav(track, filename) {
    const frames = track.left.length;
    const dataSize = frames * 4;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * 4, 28); buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
    for (let index = 0; index < frames; index += 1) {
        buffer.writeInt16LE(floatToInt16(track.left[index]), 44 + index * 4);
        buffer.writeInt16LE(floatToInt16(track.right[index]), 46 + index * 4);
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, buffer);
}

function writeMp3(track, filename, kbps) {
    if (!lamejs) {
        const ffmpeg = [
            process.env.FFMPEG_PATH,
            '/opt/homebrew/opt/ffmpeg/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            'ffmpeg',
        ].filter(Boolean).find((candidate) => candidate === 'ffmpeg' || fs.existsSync(candidate));
        if (!ffmpeg) throw new Error('MP3 encoding requires lamejs or ffmpeg.');
        const temporaryWav = `${filename}.source.wav`;
        writeWav(track, temporaryWav);
        try {
            execFileSync(ffmpeg, [
                '-hide_banner', '-loglevel', 'error', '-y', '-i', temporaryWav,
                '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`,
                '-id3v2_version', '0', '-write_id3v1', '0', filename,
            ]);
        } finally {
            if (fs.existsSync(temporaryWav)) fs.unlinkSync(temporaryWav);
        }
        return;
    }
    const encoder = new lamejs.Mp3Encoder(2, SAMPLE_RATE, kbps);
    const chunks = [];
    const blockSize = 1152;
    for (let offset = 0; offset < track.left.length; offset += blockSize) {
        const length = Math.min(blockSize, track.left.length - offset);
        const left = new Int16Array(length);
        const right = new Int16Array(length);
        for (let index = 0; index < length; index += 1) {
            left[index] = floatToInt16(track.left[offset + index]);
            right[index] = floatToInt16(track.right[offset + index]);
        }
        const encoded = encoder.encodeBuffer(left, right);
        if (encoded.length > 0) chunks.push(Buffer.from(encoded));
    }
    const flushed = encoder.flush();
    if (flushed.length > 0) chunks.push(Buffer.from(flushed));
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, Buffer.concat(chunks));
}

const assets = [
    { owner: 'lobby', name: 'l1-gallery-loop-v1', track: createLobbyMusic(), music: true },
    { owner: 'watermelon', name: 'w1-paper-loop-v1', track: createGameMusic(), music: true, targetLufs: -23, maxPeakDb: -7 },
    { owner: 'game2048', name: 't48-neon-loop-v1', track: create2048Music(), music: true, targetLufs: -22, maxPeakDb: -6 },
    { owner: 'game2048', name: 't48-danger-loop-v1', track: create2048DangerMusic(), music: true, targetLufs: -20, maxPeakDb: -5 },
    ...['lobby_button', 'lobby_popup', 'lobby_toggle'].map((name) => ({ owner: 'lobby', name: `${name.replace('_', '-')}-v1`, track: createCue(name), music: false })),
    ...['game_button', 'drop', 'collision_1', 'collision_2', 'collision_3', 'fold', 'merge', 'chain', 'danger', 'failure', 'continue', 'record'].map((name) => ({
        owner: 'watermelon',
        name: `w1-${name.replaceAll('_', '-')}-v1`,
        track: createCue(name),
        music: false,
        ...(name === 'drop' ? { targetLufs: -22, maxPeakDb: -8 } : {}),
        ...(name.startsWith('collision_') ? { targetLufs: -24, maxPeakDb: -8 } : {}),
    })),
    ...['button', 'move', 'invalid', 'spawn', 'merge2048', 'combo', 'target', 'gameover', 'record2048'].map((name) => ({
        owner: 'game2048',
        name: `t48-${name === 'merge2048' ? 'merge' : name === 'record2048' ? 'record' : name}-v1`,
        track: create2048Cue(name),
        music: false,
        targetLufs: name === 'invalid' ? -19 : -17,
        maxPeakDb: -4,
    })),
];

const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    : {
    schemaVersion: 1,
    generatedAt: '2026-08-09',
    sampleRate: SAMPLE_RATE,
    randomSeed: `0x${SEED.toString(16).toUpperCase()}`,
    generator: 'tools/audio/generate-original-audio.js',
    loudnessMethod: 'Approximate unweighted full-file RMS mapped to LUFS; not a substitute for BS.1770 meter.',
    assets: [],
};
report.revision = 5;
report.generatedAt = '2026-08-12';
const requestedNames = new Set(
    (process.env.AUDIO_ASSET_FILTER ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
);
const selectedAssets = requestedNames.size > 0
    ? assets.filter((asset) => requestedNames.has(asset.name))
    : assets;

for (const asset of selectedAssets) {
    applyBoundaryFade(asset.track, asset.music ? 0.006 : 0.025);
    const targetLufs = asset.targetLufs ?? (asset.music ? -20 : -15);
    const maxPeakDb = asset.maxPeakDb ?? (asset.music ? -5 : -2);
    const analysis = analyzeAndNormalize(asset.track, targetLufs, maxPeakDb);
    const master = path.join(sourceRoot, asset.owner, 'master', `${asset.name}.wav`);
    const runtimeRoot = asset.owner === 'lobby'
        ? lobbyRuntime
        : asset.owner === 'game2048' ? game2048Runtime : gameRuntime;
    const runtime = path.join(runtimeRoot, `${asset.name}.mp3`);
    writeWav(asset.track, master);
    writeMp3(asset.track, runtime, asset.music ? 96 : 64);
    const reportEntry = {
        owner: asset.owner,
        name: asset.name,
        kind: asset.music ? 'music-loop' : 'sound-effect',
        durationSeconds: asset.track.duration,
        loopStartSample: asset.music ? 0 : null,
        loopEndSample: asset.music ? asset.track.left.length : null,
        bitrateKbps: asset.music ? 96 : 64,
        masterPath: path.relative('.', master).replaceAll('\\', '/'),
        runtimePath: path.relative('.', runtime).replaceAll('\\', '/'),
        masterBytes: fs.statSync(master).size,
        runtimeBytes: fs.statSync(runtime).size,
        targetLufs,
        maxPeakDb,
        ...analysis,
    };
    const reportIndex = report.assets.findIndex((entry) => entry.name === asset.name);
    if (reportIndex >= 0) report.assets[reportIndex] = reportEntry;
    else report.assets.push(reportEntry);
}

report.assets.sort((left, right) => (
    assets.findIndex((asset) => asset.name === left.name)
    - assets.findIndex((asset) => asset.name === right.name)
));

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`audio_assets=${selectedAssets.length}/${assets.length}, wav=48kHz/stereo/16bit, mp3=96|64kbps, report=${reportPath}`);
