'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { typescript } = require('../server/prepare.cjs');

const root = path.resolve(__dirname, '../..');
const scripts = path.join(root, 'assets/games/rotate-rings/scripts');
const ts = typescript();
require.extensions['.ts'] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS },
    });
    mod._compile(outputText, filename);
};
const { RotateRingsModel } = require(path.join(scripts, 'RotateRingsModel.ts'));
const geometry = require(path.join(scripts, 'RotateRingsGeometry.ts'));

function verifyRecovery(level, variation, recovery = { boards: 0, hints: 0, longTurns: 0, alignments: 0 }) {
    let state = level.id * (variation + 1);
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    const choose = list => list[Math.floor(random() * list.length)];
    let model = new RotateRingsModel(level);
    for (let i = 0; i < (level.rings.length + 4) * 2 && !model.completed; i++) {
        const rings = level.rings.filter(r => !model.removedRings.has(r.id));
        const bars = level.pullObjects.filter(p => !model.removedPulls.has(p.id));
        model.beginGesture();
        if (bars.length && (!rings.length || random() < .18)) {
            const drag = model.dragPull(choose(bars).id, (random() - .5) * 2.4);
            model.endGesture(Math.abs(drag.moved) > .0001);
        } else {
            const ring = choose(rings);
            const turn = model.rotateRing(ring.id, model.angles.get(ring.id) + (random() - .5) * 310);
            model.endGesture(turn.rotated > .001);
        }
    }
    const saved = model.snapshot();
    model = new RotateRingsModel(level, saved);
    assert.deepEqual(model.snapshot(), saved, 'resume after unscripted moves');
    for (let i = 0; i < model.total * 2 + 12 && !model.completed; i++) {
        const before = model.snapshot(), hint = model.hint();
        assert(hint, 'no hint for variation ' + variation);
        assert.deepEqual(model.snapshot(), before, 'asking for a hint changed the board');
        model.beginGesture();
        if (hint.kind === 'pull') {
            model.endGesture(Math.abs(model.dragPull(hint.id, hint.target).moved) > .005);
        } else {
            // Use incremental pointer angles as gameplay does. The signed sweep sets the direction.
            const start = model.angles.get(hint.id), steps = Math.max(1, Math.ceil(Math.abs(hint.sweep) / 8));
            let rotated = 0;
            for (let step = 1; step <= steps; step++) rotated += model.rotateRing(hint.id, start + hint.sweep * step / steps).rotated;
            model.endGesture(rotated > .001);
            if (Math.abs(hint.sweep) > 180) recovery.longTurns++;
            if (hint.prepareNext) recovery.alignments++;
        }
        recovery.hints++;
    }
    assert(model.completed, 'hint cycle for variation ' + variation);
    recovery.boards++;
}

function probeExit(level, id, sign, snapshot) {
    const probe = new RotateRingsModel(level, snapshot);
    probe.beginGesture();
    probe.endGesture(Math.abs(probe.dragPull(id, sign * 1.2).moved) > .001);
    return { open: probe.removedPulls.has(id), blocker: probe.pullObstacle, model: probe };
}

// Each direction starts from an independent copy of the same pose.
function openEnds(level, id, snapshot) {
    return Number(probeExit(level, id, -1, snapshot).open) + Number(probeExit(level, id, 1, snapshot).open);
}

// Stop when neither a free slider nor a singly held outer ring can be removed.
function peelLooseParts(level, ringsFirst = false) {
    let model = new RotateRingsModel(level);
    model.evaluate();
    const incident = new Map(level.rings.map(r => [r.id, []]));
    for (const link of level.links) {
        incident.get(link.sourceRingId).push(link);
        incident.get(link.targetPartId)?.push(link);
    }
    const rings = ringsFirst ? level.rings.slice().reverse() : level.rings;
    const rails = ringsFirst ? level.pullObjects.slice().reverse() : level.pullObjects;
    const signs = ringsFirst ? [-1, 1] : [1, -1];
    function tryRail(snapshot) {
        for (const p of rails) {
            if (model.removedPulls.has(p.id)) continue;
            for (const sign of signs) {
                const exit = probeExit(level, p.id, sign, snapshot);
                if (exit.open) return exit.model;
            }
        }
    }
    function tryRing(snapshot) {
        for (const ring of rings) {
            if (model.removedRings.has(ring.id)) continue;
            const links = incident.get(ring.id).filter(l => !model.removedRings.has(l.sourceRingId)
                && !model.removedRings.has(l.targetPartId) && !model.removedPulls.has(l.targetPartId));
            if (links.length !== 1 || links[0].targetPartId !== ring.id) continue;
            const link = links[0], pin = model.pins(link.sourceRingId).find(p => p.featureId === link.pinFeatureId);
            const toward = geometry.angleTo(ring, pin.shape.center) - ring.gapDir;
            const delta = geometry.angleDiff(toward, model.angles.get(ring.id));
            for (const sweep of [delta, delta - Math.sign(delta) * 360]) {
                const probe = new RotateRingsModel(level, snapshot);
                probe.beginGesture(); probe.endGesture(probe.rotateRingBy(ring.id, sweep).rotated > .001);
                if (probe.removedRings.has(ring.id)) return probe;
            }
        }
    }
    while (!model.completed) {
        const snapshot = model.snapshot();
        const next = ringsFirst ? tryRing(snapshot) || tryRail(snapshot) : tryRail(snapshot) || tryRing(snapshot);
        if (!next) break;
        model = next;
    }
    return model.removedRings.size + model.removedPulls.size;
}

// Inside a biconnected block of rank two or more, distinct circuits share ring-to-ring clasps.
// Counting the entire board's extra edges would also count two loops joined only by a bridge.
function ringCircuits(level, removed = new Set()) {
    const neighbors = new Map(level.rings.filter(r => !removed.has(r.id)).map(r => [r.id, []]));
    for (const { sourceRingId: a, targetPartId: b } of level.links) {
        if (!neighbors.has(a) || !neighbors.has(b)) continue;
        neighbors.get(a).push(b); neighbors.get(b).push(a);
    }
    const seen = new Map(), low = new Map(), edges = [], groups = new Map(), sizes = [];
    const rings = new Set(), junctions = new Map();
    let rank = 0, largest = 0;
    function finishBlock(a, b) {
        const adjacent = new Map();
        let count = 0, edge;
        do {
            edge = edges.pop();
            const [u, v] = edge;
            if (!adjacent.has(u)) adjacent.set(u, []);
            if (!adjacent.has(v)) adjacent.set(v, []);
            adjacent.get(u).push(v); adjacent.get(v).push(u);
            count++;
        } while (edge[0] !== a || edge[1] !== b);
        const cycles = count - adjacent.size + 1;
        if (!cycles) return;
        rank += cycles;
        largest = Math.max(largest, cycles);
        for (const [id, others] of adjacent) {
            rings.add(id);
            if (cycles > 1 && others.length >= 3) {
                if (!junctions.has(id)) junctions.set(id, new Set());
                for (const other of others) junctions.get(id).add(other);
            }
        }
    }
    function visit(id, parent, group) {
        groups.set(id, group); sizes[group]++;
        seen.set(id, seen.size + 1); low.set(id, seen.get(id));
        for (const other of neighbors.get(id)) {
            if (!seen.has(other)) {
                edges.push([id, other]); visit(other, id, group);
                low.set(id, Math.min(low.get(id), low.get(other)));
                if (low.get(other) >= seen.get(id)) finishBlock(id, other);
            } else if (other !== parent && seen.get(other) < seen.get(id)) {
                edges.push([id, other]);
                low.set(id, Math.min(low.get(id), seen.get(other)));
            }
        }
    }
    for (const id of neighbors.keys()) if (!seen.has(id)) {
        sizes.push(0); visit(id, undefined, sizes.length - 1);
    }
    return { rings, junctions, rank, largest, groups, sizes };
}

function solveBoard(level) {
    const model = new RotateRingsModel(level);
    for (const ring of level.rings) assert.equal(model.blockReason(ring.id, ring.angle), undefined, 'overlap ' + ring.id);
    model.evaluate();
    assert.equal(model.progress, 0, 'board must start fully locked');
    const holds = new Map(level.rings.map(ring => [ring.id, []]));
    for (const link of level.links) {
        if (!holds.has(link.targetPartId)) continue;
        holds.get(link.targetPartId).push(link);
        const ring = model.rings.get(link.targetPartId);
        const pin = model.pins(link.sourceRingId).find(p => p.featureId === link.pinFeatureId);
        const aligned = geometry.angleTo(ring, pin.shape.center) - ring.gapDir;
        assert(geometry.pinThroughRing(pin, model.pose(ring.id, aligned)), 'clasp too wide for gap');
    }
    const joints = Array.from(holds.entries()).filter(([, links]) => links.length >= 2);
    const barExits = level.pullObjects.map(p => openEnds(level, p.id));
    const circuit = ringCircuits(level), beforeBreak = new Set();
    const jointOpenings = new Map(Array.from(circuit.junctions.keys(), id => [id, new Set()]));
    let liveCircuit = circuit, releasedTogether = 0;
    const rails = level.pullObjects.map(p => level.links.map((l, i) => l.targetPartId === p.id ? i : -1).filter(i => i >= 0));
    const shared = rails.filter(links => new Set(links.map(i => level.links[i].sourceRingId)).size > 1);
    const gates = [];
    if (circuit.sizes.length > 1) {
        assert(circuit.sizes.length <= 3 && Math.min(...circuit.sizes) >= 3, 'invalid ring groups');
        for (const [i, links] of rails.entries()) {
            const homes = new Set(links.map(j => circuit.groups.get(level.links[j].sourceRingId)));
            if (homes.size !== 1 || barExits[i]) continue;
            const home = Array.from(homes)[0], id = level.pullObjects[i].id;
            const stops = [-1, 1].map(sign => probeExit(level, id, sign).blocker);
            if (stops.some(stop => circuit.groups.has(stop) && circuit.groups.get(stop) !== home)) gates.push({ id, home });
        }
    }
    const crossings = [];
    let crossRelease = false, runs = 0, previousId, firstGesture;
    let simultaneous = 0, intact = circuit.rings.size > 0;
    const turns = new Map(), exits = new Set();
    for (let i = 0; !model.completed && i < (level.links.length + level.pullObjects.length) * 3; i++) {
        const hint = model.hint();
        assert(hint, 'no legal hint after ' + i + ' gestures');
        if (i === 0) firstGesture = hint.kind;
        if (previousId !== hint.id) runs++;
        previousId = hint.id;
        const across = crossRelease || hint.kind !== 'ring' ? [] : gates.filter(g =>
            !model.removedPulls.has(g.id) && g.home !== circuit.groups.get(hint.id) && !openEnds(level, g.id, model.snapshot()));
        const engaged = shared.map(links => links.filter(i => !model.solved.has(i)));
        const removed = new Set(model.removedRings);
        if (intact && circuit.rings.has(hint.id)) beforeBreak.add(hint.id);
        model.beginGesture();
        if (hint.kind === 'pull') {
            model.endGesture(Math.abs(model.dragPull(hint.id, hint.target).moved) > .005);
        } else {
            turns.set(hint.id, 1 + (turns.get(hint.id) || 0));
            const openings = jointOpenings.get(hint.id);
            const neighbors = circuit.junctions.get(hint.id);
            const incoming = openings ? holds.get(hint.id).filter(l => neighbors.has(l.sourceRingId) && !removed.has(l.sourceRingId)).map(l => ({
                source: l.sourceRingId, pin: model.pins(l.sourceRingId).find(p => p.featureId === l.pinFeatureId),
            })).filter(({ pin }) => !geometry.pinThroughRing(pin, model.pose(hint.id))) : [];
            const rotated = model.rotateRingBy(hint.id, hint.sweep).rotated;
            for (const { source, pin } of incoming) {
                if (geometry.pinThroughRing(pin, model.pose(hint.id))) openings.add(source);
            }
            model.endGesture(rotated > .001);
            exits.add(hint.id);
        }
        for (const gate of across) {
            if (model.removedPulls.has(gate.id) || !openEnds(level, gate.id, model.snapshot())) continue;
            const guard = circuit.groups.get(hint.id);
            // Three regions must participate in two separate gestures opening two different rails.
            crossRelease = circuit.sizes.length === 2 || crossings.some(prior => prior.id !== gate.id && prior.step !== i
                && new Set([prior.home, prior.guard, gate.home, guard]).size === circuit.sizes.length);
            if (crossRelease) break;
            crossings.push({ id: gate.id, home: gate.home, guard, step: i });
        }
        for (const links of engaged) simultaneous = Math.max(simultaneous, links.filter(i => model.solved.has(i)).length);
        if (model.removedRings.size > removed.size && liveCircuit.rank) {
            for (const id of liveCircuit.junctions.keys()) {
                if (!model.removedRings.has(id)) continue;
                const without = new Set(removed); without.add(id);
                releasedTogether = Math.max(releasedTogether, liveCircuit.rank - ringCircuits(level, without).rank);
            }
            liveCircuit = ringCircuits(level, model.removedRings);
            intact = liveCircuit.rank === circuit.rank;
        }
    }
    assert(model.completed && model.progress === model.total, 'hint route did not finish');

    assert(circuit.sizes.length === 1 || crossRelease, 'other group never opens a trapped rail');
    const looseParts = peelLooseParts(level), partCount = level.rings.length + level.pullObjects.length;
    const ringsFirstLooseParts = peelLooseParts(level, true);
    const earlyDecision = 2 * looseParts < partCount;
    return { moves: model.moves, runs, firstGesture, groups: circuit.sizes.length, crossRelease, earlyDecision,
        looseParts, ringsFirstLooseParts, partCount, barExits, loops: circuit.rank, interlocked: circuit.largest, beforeBreak: beforeBreak.size,
        junctionOpenings: Math.max(0, ...Array.from(jointOpenings.values(), sources => sources.size)), releasedTogether,
        railHosts: Math.max(...rails.map(row => row.length)), simultaneous,
        guardedRail: rails.some((row, i) => row.length > 1 && barExits[i] === 0), joints: joints.length, threeClasp: joints.filter(([, links]) => links.length >= 3).length,
        revisited: joints.filter(([id]) => turns.get(id) >= 2).length,
        ringTargets: exits.size, detonations: model.explodedBombs.size, gap: level.rings[0].gapWidth };
}

function verifyMix(route, mode, number, recipe = require('./arrangements.json')[mode][number]) {
    if (mode === 'hard') {
        assert(2 * Math.max(route.looseParts, route.ringsFirstLooseParts) < route.partCount,
            'free rails and singly held rings clear half the board');
    }
    if (recipe) {
        if (recipe.turnLeaves) assert(route.earlyDecision, 'outer pieces alone still clear half the board');
        if (recipe.bridges) assert(route.crossRelease && route.groups === recipe.bridges.length + 1, 'missing release between regions');
        if (recipe.opening !== undefined) {
            assert.equal(route.barExits.filter(Boolean).length, recipe.opening, 'different opening exits');
            if (!recipe.opening) assert.equal(route.firstGesture, 'ring');
        }
    }
    assert(route.barExits.length > 0, 'missing slider');
    if (route.loops) assert(route.beforeBreak >= 2, 'circuit bypassed');
    if (route.interlocked > 1) {
        assert(route.junctionOpenings >= 2 || route.releasedTogether >= 2, 'common clasp bypassed');
        if (number % 20 === 10 || (mode === 'normal' && number === 6)) {
            assert(route.releasedTogether >= 2, 'both circuits must still be intact at their common release');
        }
    }
    if (route.railHosts > 1) assert(route.simultaneous >= 2, 'common rail bypassed');
    if ((mode === 'hard' && number % 30 === 14) || (mode === 'normal' && number % 50 === 19)) {
        assert(route.railHosts >= 4 && route.simultaneous >= 4, 'four-grip rail bypassed');
    }
    if ((mode === 'hard' && number % 20 === 10) || (mode === 'normal' && number % 50 === 30)) {
        assert(route.guardedRail, 'shared rail can leave before clearing the board');
    }
    if (mode === 'normal' && number === 1) assert.deepEqual(route.barExits, [2], 'both tutorial exits must be clear');
    if (mode === 'hard' || number % 10 === 0) assert(route.barExits.includes(0), 'no slider held at both ends');
    assert(route.revisited >= Math.ceil(route.joints / 2), 'joint bypassed');
}

function recoveryVariations(mode, route) {
    const variations = mode === 'hard' ? [7, 8, 9] : [1, 2, 3];
    // Larger shared circuits allow more rails to be left off-center while their guards are turning.
    if (route.groups === 3) return variations.concat(53, 79, 23, 131);
    return route.interlocked >= 2 || route.crossRelease ? variations.concat(53, 79) : variations;
}

module.exports = { solveBoard, verifyRecovery, recoveryVariations, verifyMix, openEnds, peelLooseParts };

// Candidate screening reads unpacked authoring geometry. The campaign verifier starts independently from the shipped archives.
if (require.main === module) {
    const lines = require('node:readline').createInterface({ input: process.stdin });
    lines.on('line', line => {
        const { level, mode, number } = JSON.parse(line);
        try {
            const route = solveBoard(level);
            verifyMix(route, mode, number);
            for (const variant of recoveryVariations(mode, route)) verifyRecovery(level, variant);
            process.stdout.write('ok\n');
        } catch (err) {
            if (!(err instanceof assert.AssertionError)) throw err;
            process.stdout.write(JSON.stringify(err.message) + '\n');
        }
    });
}
