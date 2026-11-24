'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { solveBoard, verifyRecovery, recoveryVariations, verifyMix, openEnds } = require('./solve-board.cjs');

const root = path.resolve(__dirname, '../..');
const scripts = path.join(root, 'assets/games/rotate-rings/scripts');
const dir = path.join(root, 'assets/game-assets/rotate-rings/configs');
const { RotateRingsModel } = require(path.join(scripts, 'RotateRingsModel.ts'));
const { readRingSave, completeRingLevel, ringUnlockedLevel } = require(path.join(scripts, 'RotateRingsSave.ts'));
const { RingGeometryBank } = require(path.join(scripts, 'RotateRingsVisuals.ts'));
const { RingPackArchive, ringAscii, unpackRingBytes } = require(path.join(scripts, 'RotateRingsPack.ts'));
function buffer(name) {
    const b = fs.readFileSync(path.join(dir, name));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
const levels = new RingPackArchive(buffer('levels.bin'));
const geometry = new RingPackArchive(buffer('geometry.bin'));
const bodies = JSON.parse(ringAscii(unpackRingBytes(buffer('collisions.bin'))));
const banks = Array.from({ length: geometry.count }, (_, i) => new RingGeometryBank(unpackRingBytes(geometry.get(i)), catalog.packing.bankSize));
const totals = { levels: 0, gestures: 0, detonations: 0 };
const ids = new Set();
const results = {};
const checkPlayability = process.argv.includes('--playability');
const recovery = { boards: 0, hints: 0, longTurns: 0, alignments: 0 };

function verifySliderTravel(tutorial) {
    const bar = { ...tutorial.pullObjects[0], x: 0, y: 0, angle: 0, dragAxis: 0 };
    const empty = { ...tutorial, rings: [], pullObjects: [bar], links: [] };
    const model = new RotateRingsModel(empty);
    model.beginGesture();
    assert(Math.abs(model.dragPull(bar.id, .3).moved - .3) < 1e-5);
    assert(Math.abs(model.dragPull(bar.id, -.6).moved + .6) < 1e-5);
    model.endGesture(true);
    const resumed = new RotateRingsModel(empty, model.snapshot());
    assert(Math.abs(resumed.offsets.get(bar.id) + .3) < 1e-5);
    resumed.beginGesture();
    resumed.endGesture(resumed.dragPull(bar.id, 1.5).moved > 1);
    assert(resumed.removedPulls.has(bar.id));

    // A distant ring still blocks the exit. Probe both signs independently, including on a rotated board.
    for (const angle of [0, 45, 90]) for (const sign of [-1, 1]) {
        const rad = angle * Math.PI / 180;
        const ring = { ...tutorial.rings[0], x: sign * 20 * Math.cos(rad), y: sign * 20 * Math.sin(rad), angle, pins: [] };
        const level = { ...empty, rings: [ring], pullObjects: [{ ...bar, angle }] };
        for (const side of [-1, 1]) {
            const probe = new RotateRingsModel(level);
            probe.beginGesture();
            probe.endGesture(Math.abs(probe.dragPull(bar.id, side * 1.2).moved) > 1);
            assert.equal(probe.removedPulls.has(bar.id), side !== sign);
        }
    }
}

// Compare who holds whom, ignoring IDs, colors, rotation and screen position.
function connectionPattern(level) {
    let labels = new Map(level.rings.map(r => [r.id, 'ring']).concat(level.pullObjects.map(p => [p.id, 'rail'])));
    const neighbors = new Map(Array.from(labels.keys(), id => [id, []]));
    for (const { sourceRingId, targetPartId } of level.links) {
        neighbors.get(sourceRingId).push(['>', targetPartId]);
        neighbors.get(targetPartId).push(['<', sourceRingId]);
    }
    for (let depth = 0; depth < 6; depth++) {
        const next = new Map();
        for (const [id, edges] of neighbors) {
            const around = edges.map(([side, other]) => side + labels.get(other)).sort();
            next.set(id, createHash('sha256').update([labels.get(id), ...around].join(',')).digest('base64'));
        }
        labels = next;
    }
    return Array.from(labels.values()).sort().join(',');
}

function verify(summary, mode, patterns) {
    const [level, refs] = JSON.parse(ringAscii(unpackRingBytes(levels.get(summary.id))));
    assert.equal(level.id, summary.id);
    assert.equal(summary.rings, level.rings.length);
    assert.equal(summary.links, level.links.length);
    assert.equal(summary.bombs, level.bombs.length);
    assert.equal(summary.pulls, level.pullObjects.length);
    for (const r of level.rings) {
        r.bodyLocal = bodies[r.bodyIndex];
        assert(r.bodyLocal?.length);
    }
    assert.deepEqual(refs.map(r => r[0]), level.rings.concat(level.pullObjects).map(r => r.id));
    for (const [id, index] of refs) {
        const mesh = banks[Math.floor(index / catalog.packing.bankSize)].get(index);
        assert(mesh.indices.length > 0);
        const bar = level.pullObjects.find(p => p.id === id);
        if (bar) {
            const tip = Math.max(...bar.polyLocal.map(p => p.x));
            const meshTip = Math.max(...mesh.vertices.filter((_, i) => i % 4 === 0));
            assert(Math.abs(meshTip - tip - .18) < .001, 'visible rail and collision length mismatch');
        }
    }

    if (level.id === catalog.modes.normal[0].id) {
        assert.equal(new RotateRingsModel(level).hint()?.kind, 'pull');
        verifySliderTravel(level);
    }
    assert.equal(level.bombs.length, 0);
    for (const p of level.pullObjects) {
        assert(p.negative && p.positive);
        const isolated = { ...level, rings: [], links: [], pullObjects: [p] };
        assert.equal(openEnds(isolated, p.id), 2, 'clear slider blocked in one direction');
    }
    const route = solveBoard(level);
    assert(!Object.hasOwn(level, 'dialLock'));
    const number = catalog.modes[mode].indexOf(summary) + 1;
    const recipe = require('./arrangements.json')[mode][number];
    if (recipe) {
        const edition = (mode === 'hard' ? 960000 : 950000) + 20000 * ((recipe.revision || 1) - 1);
        assert.equal(level.id, edition + number, 'changed board reuses a previous ID');
    }
    verifyMix(route, mode, number);
    if (checkPlayability) {
        for (const variation of recoveryVariations(mode, route)) verifyRecovery(level, variation, recovery);
    }
    patterns.push(connectionPattern(level));
    totals.levels++;
    totals.gestures += route.moves;
    totals.detonations += route.detonations;
    return route;
}

// Returning players keep their completed levels. A draft and personal best belong to a specific board.
const oldBest = { moves: 3, seconds: 7 };
const upgraded = readRingSave({ modes: {
    normal: { cleared: 2, current: 2, draft: { levelId: 810002 }, best: { 1: oldBest, 2: oldBest } },
    hard: { cleared: 1, current: 1, draft: { levelId: 820001 }, best: { 1: oldBest } },
} }, catalog);
assert.equal(upgraded.modes.normal.current, 2);
assert.equal(upgraded.modes.normal.cleared, 2);
assert.equal(upgraded.modes.normal.draft, undefined);
assert.deepEqual(Object.keys(upgraded.modes.normal.best), []);
assert.equal(upgraded.modes.hard.cleared, 1);
assert.equal(upgraded.modes.hard.draft, undefined);
assert.deepEqual(Object.keys(upgraded.modes.hard.best), []);
assert(completeRingLevel(upgraded, catalog, 'normal', 2, oldBest));
assert.equal(readRingSave(upgraded, catalog).modes.normal.best['2'].levelId, catalog.modes.normal[1].id);

for (const [mode, current, oldId] of [['normal', 1, 810001], ['normal', 2, 870002], ['hard', 1, 880001],
    ['normal', 6, 910006], ['hard', 3, 920003], ['normal', 7, 910007], ['normal', 9, 910009], ['hard', 10, 940010],
    ['normal', 7, 950007], ['hard', 7, 960007], ['hard', 10, 960010]]) {
    const migrated = readRingSave({ modes: { [mode]: { current, cleared: current,
        draft: { levelId: oldId, dialTurns: [1, 0, 2] }, best: { [current]: { ...oldBest, levelId: oldId } } } } }, catalog);
    assert.equal(migrated.modes[mode].cleared, current);
    assert.equal(migrated.modes[mode].draft, undefined);
    assert.equal(migrated.modes[mode].best[current], undefined);
}

const skipped = readRingSave({
    completed: { 'normal-400': 1, 'hard-100': 1 },
    modes: Object.fromEntries(Object.entries(catalog.modes).map(([mode, levels]) => {
        const total = levels.length, levelId = levels[total - 1].id;
        return [mode, { current: total, cleared: 1, best: { [total]: { ...oldBest, levelId } }, draft: { levelId } }];
    })),
}, catalog);
for (const [mode, total] of [['normal', 400], ['hard', 100]]) {
    const progress = skipped.modes[mode];
    assert.equal(progress.current, 1);
    assert.equal(progress.cleared, 1);
    assert.equal(progress.draft, undefined);
    assert.deepEqual(Object.keys(progress.best), [String(total)]);
    const before = JSON.stringify(skipped);
    for (const number of [0, 1.5, 2, total, total + 1]) assert(!completeRingLevel(skipped, catalog, mode, number, oldBest));
    assert.equal(JSON.stringify(skipped), before);

    const fresh = readRingSave(undefined, catalog);
    for (let number = 1; number <= total; number++) {
        assert.equal(ringUnlockedLevel(fresh.completed, mode, total), number);
        assert(!completeRingLevel(fresh, catalog, mode, number + 1, oldBest));
        assert(completeRingLevel(fresh, catalog, mode, number, oldBest));
        assert.equal(fresh.modes[mode].current, Math.min(total, number + 1));
    }
    assert(completeRingLevel(fresh, catalog, mode, 1, oldBest));
    assert.equal(fresh.modes[mode].cleared, total);
    assert.equal(fresh.modes[mode].current, 2);
    const other = mode === 'normal' ? 'hard' : 'normal';
    assert.equal(ringUnlockedLevel(fresh.completed, other, catalog.modes[other].length), 1);
}
const gap = readRingSave({ completed: { 'normal-1': 1, 'normal-3': 1 }, modes: { normal: { current: 3 } } }, catalog);
assert.equal(gap.modes.normal.current, 2);
assert(completeRingLevel(gap, catalog, 'normal', 2, oldBest));
assert.equal(gap.modes.normal.current, 4);
assert.equal(gap.modes.normal.cleared, 3);
assert.deepEqual(readRingSave(gap, catalog), gap);
const cloud = require(path.join(root, 'assets/services/cloud/CloudSaveProjection.ts'));
const { encodeModule } = require(path.join(root, 'assets/services/cloud/CloudSaveCodec.ts'));
const schema = require(path.join(root, 'assets/resources/configs/cloud-save.json')).games.find(game => game.gameId === 'rotate-rings');
const payload = cloud.projectGame(schema, { dataVersion: 2, custom: { rings: skipped } });
const legacy = encodeModule([2, 1]);
const combined = cloud.mergeModule(schema, legacy, payload);
assert.equal(cloud.mergeModule(schema, combined, payload), combined);
assert.equal(cloud.mergeModule(schema, payload, legacy), combined);
const remote = readRingSave(cloud.restoreGame(schema, combined).custom.rings, catalog);
assert.deepEqual(remote.completed, { 'normal-1': 1, 'normal-2': 1, 'normal-400': 1, 'hard-1': 1, 'hard-100': 1 });
assert.equal(remote.modes.normal.current, 3);
assert.equal(remote.modes.normal.cleared, 3);
assert.equal(remote.modes.hard.cleared, 2);
assert.equal(remote.modes.hard.current, 2);
assert(!completeRingLevel(remote, catalog, 'hard', 100, oldBest));
assert(completeRingLevel(remote, catalog, 'hard', 1, oldBest));
assert.equal(remote.modes.hard.cleared, 2);

assert.equal(catalog.version, 2);
assert.equal(catalog.modes.normal.length, 400);
assert.equal(catalog.modes.hard.length, 100);
assert.equal(levels.count, 500);
for (const mode of ['normal', 'hard']) {
    const curve = [];
    const patterns = [];
    for (const summary of catalog.modes[mode]) {
        try {
            assert(!ids.has(summary.id));
            ids.add(summary.id);
            curve.push(verify(summary, mode, patterns));
        } catch (err) {
            console.error(summary.id, err.message);
            process.exitCode = 1;
        }
    }
    if (curve.length !== catalog.modes[mode].length) continue;
    assert.equal(curve.findIndex(row => row.interlocked > 1) + 1, mode === 'normal' ? 6 : 3);
    for (let i = 0; i < curve.length; i++) {
        const current = curve[i], slot = i % 10, peak = slot === 9;
        const tier = Math.floor(i / (mode === 'hard' ? 20 : 40));
        const required = mode === 'hard' ? 2 + Math.floor(tier / 2) + Number(peak)
            : i === 0 ? 0 : 1 + Number(peak) + Math.min(2, Math.floor(tier / 3));
        assert.equal(!!catalog.modes[mode][i].challenge, peak);
        if (i > 0) assert(patterns[i] !== patterns[i - 1], mode + ' repeats consecutive clasp layouts at ' + (i + 1));
        assert(current.joints >= required, mode + ' facing clasps at ' + (i + 1));
        assert(current.revisited >= Math.ceil(current.joints / 2), mode + ' joint bypassed at ' + (i + 1));
        const size = k => catalog.modes[mode][k].links + catalog.modes[mode][k].pulls;
        if (slot > 0) assert(current.gap < curve[i - 1].gap);
        if (peak) {
            assert(current.loops > 0 && current.railHosts >= 2 && current.barExits.length >= 4);
            assert(size(i) > size(i - 1));
            assert(current.moves > Math.max(...curve.slice(i - 9, i).map(row => row.moves)), mode + ' challenge route at ' + (i + 1));
            assert(current.runs > Math.max(...curve.slice(i - 9, i).map(row => row.runs)), mode + ' challenge after grouping consecutive turns at ' + (i + 1));
        }

    }
    for (let i = 0; i < curve.length; i += 10) {
        const group = curve.slice(i, i + 10);
        assert.equal(new Set(patterns.slice(i, i + 10)).size, group.length, mode + ' repeats a clasp layout in group ' + (i / 10 + 1));
        assert(group.some(row => row.loops > 0 && row.railHosts === 1));
        assert(group.some(row => row.loops === 0 && row.railHosts > 1));
        assert(group.some(row => row.crossRelease), mode + ' missing cross-group rail at ' + (i + 1));
        if (mode === 'hard' && i % 20 === 0) {
            assert(curve.slice(i, i + 20).some(row => row.groups === 3 && row.crossRelease),
                'no three-group rail puzzle in hard levels ' + (i + 1) + '–' + (i + 20));
        }
        assert(group.filter(row => row.earlyDecision).length >= 3, mode + ' repetitive outer-piece openings at ' + (i + 1));
        assert(group.filter(row => row.firstGesture === 'ring' && row.barExits.every(x => x === 0)).length >= 2,
            mode + ' too few ring-first openings at ' + (i + 1));
        assert(group.some(row => row.barExits.some(x => x > 0)), mode + ' missing pull-first opening');
        assert(group.filter(row => row.interlocked >= 2).length >= (mode === 'hard' ? 3 : 2),
            mode + ' too few interacting circuits in group ' + (i / 10 + 1));
    }
    const count = fn => curve.filter(fn).length;
    assert(curve.some(r => r.interlocked >= 4));
    results[mode] = { loopBoards: count(r => r.loops > 0), doubleCircuit: count(r => r.loops > 1),
        threeGroups: count(r => r.groups === 3),
        meanLooseFraction: curve.reduce((sum, r) => sum + r.looseParts / r.partCount, 0) / curve.length,
        crossGroup: count(r => r.crossRelease), ringFirst: count(r => r.firstGesture === 'ring' && r.barExits.every(x => x === 0)),
        earlyDecision: count(r => r.earlyDecision),
        interlockedBoards: count(r => r.interlocked >= 2), threeOrMore: count(r => r.interlocked >= 3),
        fourCircuits: count(r => r.interlocked >= 4), commonRelease: count(r => r.releasedTogether >= 2),
        multipleOpeningsAtJunction: count(r => r.junctionOpenings >= 2),
        sharedRails: count(r => r.railHosts >= 2), threeHosts: count(r => r.railHosts >= 3), fourHosts: count(r => r.railHosts >= 4),
        combined: count(r => r.railHosts >= 2 && r.loops > 0), guardedRails: count(r => r.guardedRail),
        fourBars: count(r => r.barExits.length >= 4), first: curve[0], challenge: curve[9], last: curve[curve.length-1],
        trappedAtStart: curve.filter(r => r.barExits.includes(0)).length,
        exits: [0, 1, 2].map(n => curve.reduce((sum,r) => sum + r.barExits.filter(e => e === n).length, 0)),
        boardsWithThreeClasps: curve.filter(row => row.threeClasp).length,
        boardsRevisitingAJoint: curve.filter(row => row.revisited).length };
}
console.log(totals, results);
if (checkPlayability) console.log(recovery);
