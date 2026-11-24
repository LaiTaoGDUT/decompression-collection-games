'use strict';

const hardStages = [
    { last: 39,  regular: 23, tenth: 30, twentieth: 36, depth: 3, peakDepth: 4, reading: 12, peakReading: 20 },
    { last: 150, regular: 26, tenth: 39, twentieth: 44, depth: 3, peakDepth: 5, reading: 16, peakReading: 25 },
    { last: 300, regular: 30, tenth: 43, twentieth: 48, depth: 4, peakDepth: 5, reading: 20, peakReading: 30 },
];

function hardSlot(level) {
    const stage = hardStages.find(s => level <= s.last);
    const peak = level % 10 === 0;
    let minAdvanced = level < 10 ? 20 : stage.regular;
    if (peak) minAdvanced = level % 20 === 0 ? stage.twentieth : stage.tenth;
    return {
        level, size: 11, rank: 5, hard: true, peak, minAdvanced,
        minDepth: peak ? stage.peakDepth : stage.depth,
        minReading: peak ? stage.peakReading : stage.reading,
    };
}

function fitsSequence(puzzle, slot, previous, opening, streak) {
    if ((slot.hard || slot.level > 30) && streak >= 5 && puzzle.opening === opening) return false;
    if (!slot.hard) return true;
    if (puzzle.beforeFirstCat > 45 || puzzle.longestChainRun > 32) return false;
    const { level, peak } = slot;
    if (puzzle.advanced < slot.minAdvanced || puzzle.maxChainDepth < slot.minDepth) return false;
    // Introduce a short proof before the longer ones at the first milestone.
    if (level < 10 && puzzle.maxChainDepth > 5) return false;
    // Take the weakest of eight rotated/reflected readings, so a different
    // scanning order cannot turn a hard puzzle into a string of basic singles.
    if (!(puzzle.readingAdvanced >= slot.minReading && puzzle.readingDepth >= (peak ? 4 : 3))) return false;
    if (peak) return puzzle.advanced >= previous.advanced + 4 && puzzle.readingAdvanced >= previous.readingAdvanced + 2;
    if (level > 10 && level % 10 === 1)
        return puzzle.advanced <= previous.advanced - 5 && puzzle.readingAdvanced <= previous.readingAdvanced - 3;
    return true;
}

function nearbyBoards(levels, index, direction) {
    const result = [];
    for (let i = index + direction; i >= 0 && i < levels.length && result.length < 8; i += direction) {
        if (levels[i].size === levels[index].size) result.push(levels[i]);
    }
    return result;
}

function sharesTooManyCats(puzzle, other) {
    if (puzzle.family === other.family) return true;
    let shared = 0;
    for (let row = 0; row < puzzle.size; row++) {
        if (puzzle.answer[row] === other.answer[row]) shared++;
    }
    return shared > Math.floor(puzzle.size / 2);
}

function replacementCost(p, original, frequency, slot) {
    // Retain each board's difficulty and opening. When shortening a very late first
    // placement, prefer another puzzle with a substantial initial deduction.
    const sameOpening = p.opening === original.opening;
    let openingCost = sameOpening ? 0 : 4;
    if (slot.hard && !sameOpening) {
        openingCost = p.opening >= 2 && original.opening >= 2 ? 12 : 55;
    }
    const target = slot.hard ? Math.max(original.advanced, slot.minAdvanced + (slot.level * 5 % 8)) : original.advanced;
    return (
        frequency * 12 +
        Math.abs(p.advanced - target) * 3 +
        Math.abs(p.maxChainDepth - original.maxChainDepth) +
        openingCost +
        Math.abs(p.beforeFirstCat - Math.min(original.beforeFirstCat, 32)) * 0.4 +
        Math.abs(p.longestChainRun - Math.min(original.longestChainRun, 22)) * 0.2 +
        (p.corner === original.corner ? 0 : 3) +
        Math.abs(p.edges - original.edges) * 0.25 +
        Math.abs(p.score - original.score) * 0.006
    );
}

// Select boards for their individual qualities first, then inspect their real neighbors.
// Include future boards when checking cat positions so one edit cannot spoil another slot.
function refinePlayOrder(levels, pool, slotFor, reserved, puzzleKey, revision) {
    const seenLayouts = new Set(levels.map((p) => p.layout));
    const families = new Map();
    for (const p of levels) families.set(p.family, (families.get(p.family) || 0) + 1);

    function replace(index, opening, streak) {
        const original = levels[index],
            slot = slotFor(index + 1);
        const neighbors = nearbyBoards(levels, index, -1).concat(nearbyBoards(levels, index, 1));
        let best,
            bestCost = Infinity;
        for (const p of pool.get(slot.size)[slot.rank]) {
            if (!fitsSequence(p, slot, levels[index - 1], opening, streak)) continue;
            const frequency = (families.get(p.family) || 0) - Number(p.family === original.family);
            if (p.layout !== original.layout && seenLayouts.has(p.layout)) continue;
            if (frequency >= (slot.size >= 9 ? 1 : 3)) continue;
            if (frequency && families.get(original.family) === 1) continue;
            if (original.maxChainDepth >= 3 && p.maxChainDepth < 3) continue;
            if (!slot.hard && slot.level > 300 && slot.level % 20 === 0 && p.advanced < 8) continue;
            if (neighbors.some((other) => sharesTooManyCats(p, other))) continue;
            const cost = replacementCost(p, original, frequency, slot);
            if (cost >= bestCost) continue;
            p.key ??= puzzleKey(p.cells, p.size);
            if (reserved.has(p.key)) continue;
            best = p;
            bestCost = cost;
        }
        if (!best) return false;
        families.set(original.family, families.get(original.family) - 1);
        families.set(best.family, (families.get(best.family) || 0) + 1);
        reserved.add(best.key);
        seenLayouts.add(best.layout);
        levels[index] = { ...best, revision };
        return true;
    }

    let opening = -1,
        streak = 0;
    for (let index = 0; index < levels.length; index++) {
        const slot = slotFor(index + 1);
        if (!fitsSequence(levels[index], slot, levels[index - 1], opening, streak)) {
            let changedAt = index;
            // Normal-mode repetition belongs to the whole run. If its last slot
            // cannot retain its answer diversity, break the run one slot earlier.
            const earliest = slot.hard ? index : Math.max(30, index - 4);
            while (changedAt >= earliest && !replace(changedAt, opening, streak)) changedAt--;
            if (changedAt < earliest)
                throw new Error(`No replacement for ${slot.hard ? 'hard' : 'normal'} ${slot.level}`);
            if (changedAt < index) streak = index - changedAt - 1;
        }
        const next = levels[index].opening;
        streak = next === opening ? streak + 1 : 1;
        opening = next;
    }
}
module.exports = { hardSlot, refinePlayOrder, fitsSequence };
