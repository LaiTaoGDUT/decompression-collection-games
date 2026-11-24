'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

// Each interval contains independent seeds. Results and ordering are identical
// with an empty cache or a different number of available cores.
const searches = [
    [4, 0, 150, 0],
    [5, 0, 250, 0],
    [6, 0, 400, 0],
    [7, 0, 500, 0],
    [8, 0, 8000, 0],
    [9, 0, 14000, 0],
    [10, 0, 9000, 0],
    [10, 9000, 10100, 40],
    [10, 10100, 32000, 0],
    [11, 0, 5200, 140],
    [11, 5200, 7200, 240],
    // The released 8x8 boards already cover every legal answer up to symmetries.
    // More independent partitions let an individual opening change without losing a layout.
    [8, 8000, 18000, 0, true],
    [11, 7200, 12600, 180, true],
];

async function candidateFiles() {
    const source = path.join(__dirname, 'generate-candidates.cpp');
    const digest = createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0, 16);
    const cache = path.join(os.tmpdir(), 'meowdoku-candidates-' + digest);
    fs.mkdirSync(cache, { recursive: true });
    const work = fs.mkdtempSync(path.join(cache, 'build-'));
    const binary = path.join(work, 'generate');
    try {
        await run(process.env.CXX || 'c++', ['-O3', '-std=c++17', source, '-o', binary]);
        const tasks = [];
        for (const [size, from, end, effort, refinementOnly = false] of searches) {
            for (let start = from; start < end; start += 100) {
                const stop = Math.min(end, start + 100);
                tasks.push({
                    size,
                    start,
                    stop,
                    effort,
                    refinementOnly,
                    file: path.join(cache, [size, start, stop, effort].join('-') + '.txt'),
                });
            }
        }
        let next = 0;
        async function worker() {
            while (next < tasks.length) {
                const task = tasks[next++];
                if (fs.existsSync(task.file)) continue;
                const args = [task.size, task.start, task.stop, task.effort].map(String);
                const { stdout } = await run(binary, args, { maxBuffer: 1024 * 1024 });
                const partial = path.join(work, path.basename(task.file));
                fs.writeFileSync(partial, stdout);
                fs.renameSync(partial, task.file);
            }
        }
        // Start expensive 11x11 searches early without changing the read order.
        const ordered = tasks.slice();
        tasks.reverse();
        const workers = await Promise.allSettled(
            Array.from({ length: Math.min(6, os.availableParallelism?.() || os.cpus().length) }, worker),
        );
        const failed = workers.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
        return ordered;
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}
function gradeHardReadings(puzzles) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meowdoku-readings-'));
    try {
        const binary = path.join(work, 'grade');
        execFileSync(process.env.CXX || 'c++', ['-O3', '-std=c++17', path.join(__dirname, 'generate-candidates.cpp'), '-o', binary]);
        const input = puzzles.map(p => p.cells.map(v => v.toString(36)).join('')).join('\n');
        const output = execFileSync(binary, ['--hard-readings'], { input, encoding: 'utf8' });
        const lines = output.trimEnd().split('\n');
        if (lines.length !== puzzles.length) throw new Error('Missing hard board readings');
        for (const [index, line] of lines.entries()) {
            const [advanced, depth] = line.split(' ').map(Number);
            puzzles[index].readingAdvanced = advanced;
            puzzles[index].readingDepth = depth;
        }
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

module.exports = { candidateFiles, gradeHardReadings };
if (require.main === module)
    candidateFiles()
        .then((files) => console.log(files.length + ' candidate batches ready'))
        .catch((e) => {
            console.error(e);
            process.exitCode = 1;
        });
