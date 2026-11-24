'use strict';

/** 从规则生成固定题库。运行 node project-scripts/meowdoku/build-level-bank.cjs [--check]。 */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const { typescript } = require('../server/prepare.cjs');

const scripts = path.resolve(__dirname, '../../assets/games/meowdoku/scripts');
const { candidateFiles, gradeHardReadings } = require('./candidate-search.cjs');
const { hardSlot, refinePlayOrder, fitsSequence } = require('./refine-play-order.cjs');
const initialSizes = [4, 5, 5, 6, 6, 6, 7, 7, 8, 8];
const sizePatterns = [
    [11, [6, 7, 6, 7, 8, 7, 6, 8, 7, 8]],
    [31, [7, 8, 7, 8, 9, 8, 7, 9, 8, 9]],
    [101, [8, 9, 8, 10, 9, 8, 10, 9, 8, 10]],
    [301, [8, 9, 10, 9, 10, 8, 10, 9, 10, 10]],
];
const normalCount = 3500;
const priorHardEdition = require('./hard-edition-1.json');
const strategyOrder = ['R1', 'R2', 'R3', 'R4', 'R4_chain', 'R5_chain'];

function loadScript(name, dependencies = {}) {
    const ts = typescript();
    const source = fs.readFileSync(path.join(scripts, name + '.ts'), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    });
    const context = { exports: {}, require: (name) => dependencies[name] };
    vm.runInNewContext(outputText, context);
    return context.exports;
}

function puzzleKey(cells, size) {
    let key;
    for (let transform = 0; transform < 8; transform++) {
        const labels = Array(size).fill(-1);
        let labelCount = 0;
        let serialized = '';
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const r = transform & 4 ? col : row;
                const c = transform & 4 ? row : col;
                const color = cells[(transform & 1 ? size - 1 - r : r) * size + (transform & 2 ? size - 1 - c : c)];
                if (labels[color] < 0) labels[color] = labelCount++;
                serialized += labels[color].toString(36);
            }
        }
        if (key === undefined || serialized < key) key = serialized;
    }
    return key;
}

function grade(solver, candidate, prefill) {
    const { cells, answer } = candidate;
    const size = answer.length;
    const regions = answer.map((_, row) => cells.slice(row * size, (row + 1) * size));
    const board = regions.map((row) => row.map(() => solver.SOLVER_UNKNOWN));
    if (prefill !== undefined) board[prefill][answer[prefill]] = solver.SOLVER_CAT;
    let opening = -1,
        beforeFirstCat = 0,
        consecutiveChains = 0,
        longestChainRun = 0;
    let placed = prefill === undefined ? 0 : 1;
    let hardest = 0,
        advanced = 0,
        score = 0,
        maxChainDepth = -1;
    while (placed < size) {
        // 答案只用于核对提示。推理求解器只读取当前棋盘和色区。
        const hint = solver.solveMeowdokuHint(board, size, regions);
        if (!hint) return undefined;
        if (hint.action === 'place') {
            const [row, col] = hint.cell;
            if (answer[row] !== col || board[row][col] !== solver.SOLVER_UNKNOWN) throw new Error('错误的放猫提示');
            board[row][col] = solver.SOLVER_CAT;
            placed++;
        } else {
            let changed = false;
            for (const [row, col] of hint.markCells) {
                if (answer[row] === col) throw new Error('错误的排除提示');
                if (board[row][col] !== solver.SOLVER_UNKNOWN) continue;
                board[row][col] = solver.SOLVER_EXCLUDED;
                changed = true;
            }
            if (!changed) throw new Error('提示未推进棋盘');
        }
        const strategy = strategyOrder.indexOf(hint.strategy);
        if (opening < 0 && strategy >= 0) opening = strategy;
        if (strategy > 0 && placed === (prefill === undefined ? 0 : 1)) beforeFirstCat++;
        if (strategy >= 0) {
            consecutiveChains = strategy >= 4 ? consecutiveChains + 1 : 0;
            longestChainRun = Math.max(longestChainRun, consecutiveChains);
        }
        hardest = Math.max(hardest, strategy);
        if (strategy >= 3) advanced++;
        if (hint.chain) maxChainDepth = Math.max(maxChainDepth, hint.chain.steps.length);
        score += [1, 4, 10, 20, 28, 48][strategy] ?? 0;
    }
    return { hardest, advanced, score, maxChainDepth, opening, beforeFirstCat, longestChainRun };
}

function difficultyRank({ hardest, advanced, maxChainDepth }) {
    if (hardest === 0) return 1;
    if (hardest === 1) return 2;
    if (hardest === 5 || advanced >= 4) return 5;
    if (advanced >= 2 || hardest === 3 || maxChainDepth >= 1) return 4;
    return 3;
}

function pack(puzzles) {
    const bytes = [];
    for (const { cells, answer, rank, seed: puzzleSeed, prefill } of puzzles) {
        const size = answer.length;
        bytes.push(size, rank);
        let rest = puzzleSeed;
        while (rest >= 128) {
            bytes.push((rest & 127) | 128);
            rest >>>= 7;
        }
        bytes.push(rest, prefill === undefined ? 255 : prefill * size + answer[prefill]);
        const digits = cells.concat(answer);
        for (let index = 0; index < digits.length; index += 2) bytes.push(digits[index] * 16 + digits[index + 1]);
    }
    return Buffer.from(bytes).toString('base64');
}

function render(header, constant, puzzles) {
    const revised = puzzles.flatMap((p, index) => (p.revision ? [`${index + 1}: ${p.revision}`] : []));
    const chunks = pack(puzzles).match(/.{1,10000}/g);
    const encoded = chunks.map((chunk) => `'${chunk}'`).join('\n    + ');
    return (
        header +
        `export const ${constant}: readonly MeowdokuLevelDefinition[] = decodeMeowdokuLevels(\n` +
        `    ${encoded},\n    ${puzzles.length}, { ${revised.join(', ')} },\n);\n`
    );
}

function fraction(level, salt) {
    let h = Math.imul(level ^ salt, 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function normalSlot(level) {
    const beat = (level - 1) % 10;
    const pattern = sizePatterns.reduce((sizes, [from, values]) => (level >= from ? values : sizes), initialSizes);
    const size = pattern[beat];
    const block = Math.floor((level - 1) / 20);
    let rank;
    if (level <= 10) rank = 1;
    else if (level <= 30) rank = [1, 2, 2, 2, 2, 1, 2, 2, 3, 2][beat];
    else if (level <= 100) rank = [2, 2, 3, 2, 2, 3, 2, 3, 2, 4][beat];
    else if (level <= 300) rank = [2, 3, 2, 4, 3, 2, 3, 3, 2, 4][beat];
    else {
        // Across 20 levels: four easier locks, eight intermediate, three advanced,
        // five peaks. Rotate the middle slots so size does not reveal the strategy.
        const middle = [2, 3, 5, 3, 4, 2, 3, 5, 3, 2, 4, 3, 5, 3, 2, 4, 3, 3];
        rank =
            beat === 9
                ? 5
                : middle[(((level - 1) % 20) - ((level - 1) % 20 >= 10 ? 1 : 0) + block * 5) % middle.length];
    }
    if (level >= 60 && level % 20 === 0) rank = 5;
    return { level, size, rank, prefilled: level <= 10, hard: false };
}

function answerKey(answer) {
    const n = answer.length;
    let key;
    for (let transform = 0; transform < 8; transform++) {
        const result = Array(n);
        answer.forEach((c, r) => {
            const row = transform & 4 ? c : r,
                col = transform & 4 ? r : c;
            result[transform & 2 ? n - 1 - row : row] = (transform & 1 ? n - 1 - col : col).toString(36);
        });
        const value = result.join('');
        if (key === undefined || value < key) key = value;
    }
    return key;
}

function readPool(files) {
    const pool = [];
    for (const { size, file } of files) {
        for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
            if (!line) continue;
            const [sequence, h, a, d, s, op, before, chains, layout, board] = line.split(' ');
            const cells = Array.from(board, (v) => parseInt(v, 36)),
                answer = Array.from(layout, (v) => parseInt(v, 36));
            const areas = Array(size).fill(0);
            let edges = 0;
            for (let i = 0; i < cells.length; i++) {
                areas[cells[i]]++;
                if (i % size && cells[i - 1] !== cells[i]) edges++;
                if (i >= size && cells[i - size] !== cells[i]) edges++;
            }
            const candidate = {
                size,
                seed: size * 1000000 + Number(sequence) + 1,
                cells,
                answer,
                layout,
                family: answerKey(answer),
                largest: Math.max(...areas) / size,
                edges,
                corner: [answer[0], answer[size - 1]].some((c) => c === 0 || c === size - 1),
                hardest: +h,
                advanced: +a,
                maxChainDepth: +d,
                score: +s,
                opening: +op,
                beforeFirstCat: +before,
                longestChainRun: +chains,
            };
            candidate.rank = difficultyRank(candidate);
            pool.push(candidate);
        }
    }
    return pool;
}

function normalTarget({ level, rank, size }) {
    const draw = (salt) => fraction(level, salt);
    const peak = level % 20 === 0;
    let advanced = 0;
    let long = false;
    if (rank === 5) {
        long = level >= 320 && ((peak && level % 60 !== 0) || (level % 10 !== 0 && draw(15) < 0.04));
        if (peak && level <= 100) advanced = 4 + 3 * draw(19);
        else if (peak && level <= 300) advanced = 6 + 5 * draw(19);
        else advanced = peak ? 9 + 9 * draw(19) : 4 + 3 * draw(20);
    } else if (rank === 4) advanced = 1 + 2 * draw(26);
    else if (rank === 3) advanced = draw(29) < 0.78 ? 0 : 1;
    const r = draw(103);
    // The old 8x8 boards often opened on a single. Most 10x10 boards instead
    // opened by locking a region to a line. Preserve that change in reading order.
    const singleShare = size <= 8 ? 0.53 : size === 9 ? 0.25 : 0.09;
    const simpleShare = size <= 8 ? 0.925 : size === 9 ? 0.86 : 0.79;
    const opening =
        level <= 100
            ? r < 0.68
                ? 0
                : r < 0.94
                ? 1
                : 2
            : r < singleShare
            ? 0
            : r < simpleShare
            ? 1
            : r < 0.963
            ? 2
            : r < 0.993
            ? 3
            : 4;
    const shape = {
        8: [48, 17, 10, 2.1],
        9: [59, 15, 14, 2.4],
        10: [76, 14, 11, 3.5],
    }[size] || [size * size * 0.7, size, size, 2];
    const width = draw(55) * 2 - 1;
    return {
        advanced,
        long,
        opening,
        corner: draw(82) < 0.38,
        edges: shape[0] + width * (width < 0 ? shape[1] : shape[2]),
        largest: shape[3] + (draw(56) - 0.5) * 1.8,
    };
}

function pickNormalLevels(slots, pool, reserved, solver) {
    const used = new Set(),
        usedLayouts = new Set(),
        families = new Map(),
        recent = new Map();
    const selected = [];
    for (const slot of slots) {
        const { size, level, rank } = slot;
        const group = pool.get(size)[slot.prefilled ? 0 : rank];
        const history = recent.get(size) || [];
        const target = normalTarget(slot);
        let best,
            bestCost = Infinity;
        for (const p of group) {
            if (used.has(p.seed) || usedLayouts.has(p.layout)) continue;
            const frequency = families.get(p.family) || 0;
            if ((size >= 9 && frequency) || (size === 8 && frequency >= 3)) continue;
            if (target.long && p.maxChainDepth < 3) continue;
            if (level > 300 && level % 20 === 0 && p.advanced < 8) continue;
            if (history.some((prior) => prior.family === p.family && size >= 7)) continue;
            if (
                size >= 7 &&
                history.some((prior) => {
                    let shared = 0;
                    for (let row = 0; row < size; row++) if (prior.answer[row] === p.answer[row]) shared++;
                    return shared > Math.floor(size / 2);
                })
            )
                continue;
            const openingCost = p.opening === target.opening ? 0 : p.opening >= 2 && target.opening >= 2 ? 5 : 17;
            const cost =
                frequency * 45 +
                (p.corner !== target.corner ? 8 : 0) +
                openingCost +
                Math.abs(p.advanced - target.advanced) * 1.6 +
                Math.abs(p.edges - target.edges) * 0.33 +
                Math.abs(p.largest - target.largest) * 2.5 +
                fraction(p.seed, level) * 1.25;
            if (cost >= bestCost) continue;
            p.key ??= puzzleKey(p.cells, size);
            if (reserved.has(p.key)) continue;
            let candidate = p;
            if (slot.prefilled) {
                if (p.intro === undefined) {
                    p.intro = null;
                    for (let i = 0; i < size; i++) {
                        const row = (i + p.seed) % size;
                        const trace = grade(solver, p, row);
                        if (trace && difficultyRank(trace) === 1) {
                            p.intro = { ...trace, prefill: row, rank: 1 };
                            break;
                        }
                    }
                }
                if (!p.intro) continue;
                candidate = { ...p, ...p.intro };
            }
            bestCost = cost;
            best = candidate;
        }
        if (!best)
            throw new Error(
                `No candidate for normal ${level}, ${size}x${size}, rank ${rank}, long=${
                    target.long
                }`,
            );
        used.add(best.seed);
        usedLayouts.add(best.layout);
        reserved.add(best.key);
        families.set(best.family, (families.get(best.family) || 0) + 1);
        history.push(best);
        if (history.length > 8) history.shift();
        recent.set(size, history);
        selected.push(best);
    }
    return selected;
}

async function build(check) {
    const solver = loadScript('MeowdokuSolver');
    const { MEOWDOKU_TUTORIAL_BOARD: tutorial } = loadScript('MeowdokuTheme', { cc: { Color: class {} } });
    const reserved = new Set([puzzleKey(tutorial.regions.flat(), tutorial.size)]);
    const pool = new Map();
    const files = await candidateFiles();
    const addCandidates = (batches) => {
        for (const p of readPool(batches)) {
            if (!pool.has(p.size))
                pool.set(
                    p.size,
                    Array.from({ length: 6 }, () => []),
                );
            const ranks = pool.get(p.size);
            ranks[p.rank].push(p);
            if (p.rank <= 3) ranks[0].push(p);
        }
    };
    addCandidates(files.filter((f) => !f.refinementOnly));
    const normal = pickNormalLevels(
        Array.from({ length: normalCount }, (_, i) => normalSlot(i + 1)),
        pool,
        reserved,
        solver,
    );
    // Existing saves without a slot revision point to this exact normal edition.
    const digest = levels => createHash('sha256').update(Buffer.from(pack(levels), 'base64')).digest('hex');
    if (digest(normal) !== 'c3cbf036a4c49ee9dd1b9051d4bd17c10720cb2a8d567a6878648e791bb5ec1f')
        throw new Error('Unversioned normal boards changed.');
    addCandidates(files.filter((f) => f.refinementOnly));
    refinePlayOrder(normal, pool, normalSlot, reserved, puzzleKey, 1);

    // Start with the last accepted hard edition so a slot which still meets the
    // curve keeps its exact board and can resume an existing game.
    const candidates = pool.get(11).slice(1).flat();
    const bySeed = new Map(candidates.map(p => [p.seed, p]));
    const revised = new Set(priorHardEdition.revisedLevels);
    gradeHardReadings(pool.get(11)[5]);
    const hard = priorHardEdition.seeds.map((seed, index) => {
        const p = bySeed.get(seed);
        if (!p) throw new Error('Missing released hard seed ' + seed);
        reserved.add(puzzleKey(p.cells, p.size));
        return revised.has(index + 1) ? { ...p, revision: 1 } : p;
    });
    if (hard.length !== 300 || digest(hard) !== priorHardEdition.sha256)
        throw new Error('Released hard boards changed before revision 2.');
    refinePlayOrder(hard, pool, hardSlot, reserved, puzzleKey, 2);
    for (const [kind, levels] of [
        ['normal', normal],
        ['hard', hard],
    ]) {
        verifyQuality(levels, kind === 'hard');
        for (const p of levels) {
            const trace = grade(solver, p, p.prefill);
            if (
                !trace ||
                difficultyRank(trace) !== p.rank ||
                (p.prefill === undefined &&
                    [
                        'hardest',
                        'advanced',
                        'maxChainDepth',
                        'score',
                        'opening',
                        'beforeFirstCat',
                        'longestChainRun',
                    ].some((k) => p[k] !== trace[k]))
            ) {
                throw new Error(`In-game trace disagrees with candidate ${p.seed}`);
            }
        }
        console.log(kind, JSON.stringify(summarize(levels)));
    }
    const normalFile = path.join(scripts, 'MeowdokuLevels.ts');
    const hardFile = path.join(scripts, 'MeowdokuHardLevels.ts');
    const normalSource = fs.readFileSync(normalFile, 'utf8');
    const revision = Math.max(...normal.concat(hard).map(p => p.revision || 0));
    const header = normalSource.slice(0, normalSource.indexOf('export const MEOWDOKU_LEVELS:'))
        .replace(/export const MEOWDOKU_BANK_REVISION = \d+;/, `export const MEOWDOKU_BANK_REVISION = ${revision};`);
    const hardHeader =
        '/** 猫咪数独困难模式原创题库。由 project-scripts/meowdoku/build-level-bank.cjs 生成。 */\n' +
        "import { decodeMeowdokuLevels, type MeowdokuLevelDefinition } from './MeowdokuLevels';\n\n";
    for (const [file, contents] of [
        [normalFile, render(header, 'MEOWDOKU_LEVELS', normal)],
        [hardFile, render(hardHeader, 'MEOWDOKU_HARD_LEVELS', hard)],
    ]) {
        if (check) {
            if (fs.readFileSync(file, 'utf8') !== contents)
                throw new Error(file + ' differs from fixed-seed results');
        } else fs.writeFileSync(file, contents);
    }
}

function summarize(levels) {
    const advanced = levels.map((p) => p.advanced).sort((a, b) => a - b);
    return {
        revised: levels.filter((p) => p.revision).length,
        mostBeforeFirstCat: Math.max(...levels.map((p) => p.beforeFirstCat)),
        longestChainRun: Math.max(...levels.map((p) => p.longestChainRun)),
        layouts: new Set(levels.map((p) => p.layout)).size,
        families: new Set(levels.map((p) => p.family)).size,
        corners: levels.filter((p) => p.corner).length,
        long: levels.filter((p) => p.maxChainDepth >= 3).length,
        advancedMedian: advanced[Math.floor(advanced.length / 2)],
        advancedP90: advanced[Math.floor(advanced.length * 0.9)],
        openings: Array.from({ length: 6 }, (_, k) => levels.filter((p) => p.opening === k).length),
    };
}

function verifyQuality(levels, hard) {
    const s = summarize(levels),
        n = levels.length;
    // Reference measured with this hint engine: 2574/3500 and 238/275 symmetry
    // classes; hard median/P90 30/46, 268/275 long chains. Leave room for variation.
    let opening = -1,
        streak = 0;
    for (const [index, p] of levels.entries()) {
        const slot = hard ? hardSlot(index + 1) : normalSlot(index + 1);
        if (!fitsSequence(p, slot, levels[index - 1], opening, streak))
            throw new Error(`Rhythm regression at ${hard ? 'hard' : 'normal'} ${index + 1}`);
        streak = p.opening === opening ? streak + 1 : 1;
        opening = p.opening;
    }
    const advancedOpenings = s.openings.slice(2).reduce((a, b) => a + b, 0);
    // Keep both compact and winding partitions, and preserve the change from
    // single-region starts on smaller boards to line locks on larger ones.
    for (const [size, minSingles, maxSingles, medianEdges] of [
        [8, 0.36, 0.66, 48],
        [9, 0.15, 0.42, 59],
        [10, 0.06, 0.25, 76],
        [11, 0.18, 0.4, 80],
    ]) {
        const group = levels.filter((p) => p.size === size);
        if (!group.length) continue;
        const singles = group.filter((p) => p.opening === 0).length / group.length;
        const edges = group.map((p) => p.edges).sort((a, b) => a - b);
        const percentile = (q) => edges[Math.floor(q * edges.length)];
        if (
            singles < minSingles ||
            singles > maxSingles ||
            Math.abs(percentile(0.5) - medianEdges) > 6 ||
            percentile(0.9) - percentile(0.1) < 7
        ) {
            throw new Error(`Opening or region-shape distribution regressed for ${size}x${size}`);
        }
    }
    if (
        s.layouts !== n ||
        s.families < (hard ? n : 3435) ||
        s.corners / n < (hard ? 0.18 : 0.25) ||
        s.corners / n > (hard ? 0.4 : 0.5) ||
        s.long < (hard ? n : 105) ||
        (hard && (s.advancedMedian < 33 || s.advancedMedian > 40)) ||
        s.advancedP90 < (hard ? 45 : 5) ||
        s.advancedP90 > (hard ? 55 : 10) ||
        advancedOpenings / n < (hard ? 0.2 : 0.1) ||
        advancedOpenings / n > (hard ? 0.4 : 0.22)
    ) {
        throw new Error('Bank quality regression ' + JSON.stringify(s));
    }
}

if (require.main === module)
    build(process.argv.includes('--check')).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
module.exports = { loadScript, grade, difficultyRank, normalSlot, hardSlot, pack, answerKey, verifyQuality };
