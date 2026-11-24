'use strict';

// Builds the shipped bank from the game rules. The existing packs are only read by --check.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const scripts = path.join(root, 'assets/games/cube-away/scripts');
const output = path.join(root, 'assets/game-assets/cube-away/configs');
const chapters = [
    '小蛇出发', '中途歇脚', '借道转弯', '结伴出发', '方向翻转',
    '让路接力', '一路变两路', '浅谷驿站', '柔棱岔道', '隔岸相望',
    '六面寻路', '首尾呼应', '转角相遇', '穿谷而行', '沿边绕行',
    '双向驿站', '蛇阵回环', '岔路相逢', '翻转接力', '对向而行',
    '高低相望', '顺序调度', '前后错位', '多路并行', '深谷绕行',
];
const minSnakeCells = 4;
const introductions = { double: 5, carved: 8, cornerless: 11, pause: 14, branch: 20, changer: 26,
    reverse_changer: 39, split_changer: 53 };
const families = [['carved', 'cornerless'], ['pause', 'changer', 'reverse_changer', 'split_changer'], ['double', 'branch']];

// Alternate a first encounter, recall, and a combination the player already knows how to read.
function mechanicsForLevel(id) {
    const unlocked = Object.keys(introductions).filter(key => introductions[key] <= id);
    const lesson = unlocked.find(key => [0, 2].includes(id - introductions[key]));
    if (lesson) return [lesson];
    if (id <= 4 || id === 6 || id === 12) return [];
    const peak = id % 5 === 0;
    const newest = unlocked[unlocked.length - 1];
    const revisit = id - introductions[newest] === 4;
    const triple = (peak && id >= 30) || (id >= 125 && id % 5 === 4);
    const pair = revisit || (id >= 9 && (id >= 125 || id % 5 !== 1));
    const count = triple ? 3 : pair ? 2 : 1;
    const choices = families.map(group => group.filter(key => unlocked.includes(key))).filter(group => group.length);
    const random = createRandom(Math.imul(id + 43, 0x85ebca6b));
    const selected = [];
    while (selected.length < count && choices.length) {
        const slot = revisit && !selected.length ? choices.findIndex(group => group.includes(newest)) : random(choices.length);
        const [family] = choices.splice(slot, 1);
        selected.push(revisit && !selected.length ? newest : family[random(family.length)]);
    }
    const tiles = unlocked.filter(mode => tileCodes[mode]);
    const primary = selected.find(mode => tileCodes[mode]);
    if (primary && tiles.length > 1 && (id % 4 !== 1 || peak)) {
        const other = tiles.filter(mode => mode !== primary);
        selected.push(other[random(other.length)]);
    }
    return selected;
}

function challengeForLevel(id, difficulty) {
    if (id === 1) return { target: 20, minOpen: 6, maxOpen: 9, minDepth: 2 };
    const progress = Math.min(1, (id - 2) / 420);
    if (difficulty !== 'normal') {
        const expert = difficulty === 'expert';
        const ramp = Math.min(id, 45) / 45;
        const target = Math.round(expert ? 145 + 155 * ramp + 220 * (id / 500)
            : 60 + 132 * ramp + 104 * progress + [0, 6, 18, 0][(id / 5) % 4]);
        const minDepth = expert ? 12 + Math.floor(10 * id / 500) : 6 + Math.floor(6 * ramp + 3 * progress);
        return { target, minOpen: 2, maxOpen: Math.floor(target * (expert ? .14 : .19 - .035 * ramp)), minDepth };
    }
    const beat = (id - 2) % 5;
    const base = 35 + 18 * Math.min(1, (id - 2) / 24) + 60 * progress;
    const target = Math.round(base * [.90, 1.04, 1.18, .84, 1.28][beat]);
    return { target, minOpen: 2, maxOpen: Math.floor(target * (.39 - .10 * progress - (beat === 4 ? .025 : 0))),
        minDepth: 3 + Math.floor(progress * 4) + Number(beat === 4) };
}

const directions = ['R', 'L', 'U', 'D'];
const tileCodes = { pause: 1, changer: 2, reverse_changer: 3, split_changer: 4 };

function createRandom(seed) {
    let state = seed >>> 0;
    return (bound) => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return (state >>> 0) % bound;
    };
}

function encodeRuns(steps) {
    const runs = [];
    for (const direction of steps) {
        const last = runs[runs.length - 1];
        if (last?.direction === direction) last.count++;
        else runs.push({ direction, count: 1 });
    }
    return runs.map(({ direction, count }) => direction + (count > 1 ? count : '')).join('');
}

function generateBank(engine, types) {
    const { CubeAwayBoard, makeCornerlessKey, faceFromNormal, dirFromVector } = engine;
    const {
        CUBE_AWAY_LEVEL_BANK, CUBE_AWAY_TOTAL_LEVELS, CUBE_AWAY_CHAPTER_SIZE: levelsPerChapter,
        FACES, DIRS, FACE_NORMAL, CUBE_FRAME, OPPOSITE_DIR, OPPOSITE_FACE, parseCellId, formatCellId,
        cubeAwayDifficulty, hasCubeAwayEdgeRelay, hasCubeAwayDoubleChain,
    } = types;
    assert.equal(chapters.length * levelsPerChapter, CUBE_AWAY_TOTAL_LEVELS);
    const frontFaces = ['+z', '-x', '+y'];
    const noDependencies = new Set();
    const noDirectionOverrides = new Map();
    const seenLayouts = new Set();
    const seenMechanics = new Set();
    const files = new Map();
    const chapterIndex = [];
    const levelIndex = [];

    function createFaceGrid(size, face, random) {
        const right = DIRS[random(4)];
        const vertical = ['up', 'down'].includes(right);
        const up = vertical ? ['right', 'left'][random(2)] : ['up', 'down'][random(2)];
        const uAxis = CUBE_FRAME[face][right], vAxis = CUBE_FRAME[face][up], normal = FACE_NORMAL[face];
        const width = size[uAxis.findIndex(Boolean)], height = size[vAxis.findIndex(Boolean)], depth = size[normal.findIndex(Boolean)];
        // The upper depth plane is the visible face. The same frame maps both snakes and voxel cuts.
        function point(u, v, w) {
            return size.map((length, i) => (uAxis[i] < 0 || vAxis[i] < 0 || normal[i] < 0 ? length - 1 : 0)
                + uAxis[i] * u + vAxis[i] * v + normal[i] * w);
        }
        function span(u0, v0, w0, u1, v1, w1) {
            const a = point(u0, v0, w0), b = point(u1, v1, w1);
            return a.map((n, i) => Math.min(n, b[i])).concat(a.map((n, i) => Math.max(n, b[i])));
        }
        return { face, width, height, depth, right, up, span,
            cell: (u, v) => formatCellId(...point(u, v, depth - 1), face) };
    }

    function appendSnake(board, pack, cells, fireDirection, flags = 0, group = 0) {
        const head = parseCellId(cells[0]);
        const steps = cells.slice(1).map((cell, i) => {
            const dir = DIRS.findIndex(direction => board.surfaceGraph.get(cells[i])?.[direction]?.nextCellId === cell);
            assert(dir >= 0, `Disconnected snake in level ${pack.id}`);
            return directions[dir];
        });
        pack.arrows.push({
            h: [head.x, head.y, head.z, FACES.indexOf(head.face)], d: DIRS.indexOf(fireDirection),
            f: flags, g: group, r: encodeRuns(steps),
        });
        const id = board.arrows.length;
        board.arrows.push({
            id, cells, fireDir: fireDirection, isDouble: (flags & 1) !== 0, isBranch: (flags & 2) !== 0,
            linkGroup: group, colorIndex: id, removed: false,
        });
        for (const cell of cells) board.cellOccupancy.set(cell, [id]);
    }

    // Both panels use the same v coordinate along their shared edge.
    // u counts inward from that edge on the selected panel.
    function adjoiningPanel(grid) {
        const across = OPPOSITE_DIR[grid.right];
        const neighbour = faceFromNormal(...CUBE_FRAME[grid.face][across]);
        const normal = FACE_NORMAL[grid.face];
        function cell(other, u, v) {
            if (!other) return grid.cell(u, v);
            const edge = parseCellId(grid.cell(0, v));
            return formatCellId(edge.x - u * normal[0], edge.y - u * normal[1], edge.z - u * normal[2], neighbour);
        }
        return { across, neighbour, cell };
    }

    function addTile(board, pack, cellId, mode, dir) {
        const p = parseCellId(cellId);
        const exitDir = mode === 'pause' ? undefined : dir;
        const exitDir2 = mode === 'split_changer' ? OPPOSITE_DIR[dir] : undefined;
        (pack.gim ??= []).push([p.x, p.y, p.z, FACES.indexOf(p.face), tileCodes[mode],
            DIRS.indexOf(exitDir), DIRS.indexOf(exitDir2)]);
        board.gimmicks.set(cellId, { cellId, type: mode, x: p.x, y: p.y, z: p.z, face: p.face, exitDir, exitDir2,
            currentReverseDir: mode === 'reverse_changer' ? dir : undefined });
    }

    function addLesson(board, pack, modes, random, grid, channel) {
        if (!modes.length) return true;
        const { cell, right, up } = grid;
        const row = channel?.row ?? 2 + random(grid.height - 4);
        const tileMode = modes.find(mode => tileCodes[mode]);
        const tileColumn = channel?.landing ?? Math.max(3, Math.floor(grid.width / 2));
        const freeWidth = channel?.cut ?? (tileMode && !modes.includes('cornerless') ? tileColumn : grid.width - 1);
        const start = random(freeWidth - 2);
        const add = (points, dir, flags = 0, group = 0) =>
            appendSnake(board, pack, points.map(([u, v]) => cell(u, v)), dir, flags, group);

        // The mechanic is placed directly in the primary snake's escape route. The double
        // uses its tail to take that route while a separate snake blocks its head.
        if (modes.includes('double')) {
            const rise = 1 + random(grid.height - row - 2);
            const body = Array.from({ length: rise + 1 }, (_, i) => [start, row + rise - i]);
            body.push([start + 1, row], [start + 2, row]);
            add(body, up, 1);
            const stop = row + rise + 1;
            add([[start, stop], [start + 1, stop], [start + 2, stop], [start + 2, stop - 1]], OPPOSITE_DIR[right]);
        } else {
            const linked = modes.includes('branch');
            const body = [[start + 2, row], [start + 1, row], [start, row]];
            const tail = 1 + random(Math.min(row, 3));
            for (let i = 1; i <= tail; i++) body.push([start, row - i]);
            add(body, right, linked ? 2 : 0, linked ? 1 : 0);
            if (linked) {
                const back = createFaceGrid(pack.size, OPPOSITE_FACE[grid.face], random);
                const y = 1 + random(back.height - 2);
                const points = [[2, y], [1, y], [0, y], [0, y - 1]].map(([u, v]) => back.cell(u, v));
                if (!points.every(c => board.exposedCells.has(c))) return false;
                appendSnake(board, pack, points, back.right, 2, 1);
                board.linkGroups.set(1, [0, 1]);
            }
        }

        let tile;
        let exit = random(2) ? up : OPPOSITE_DIR[up];
        if (modes.includes('cornerless')) {
            const edge = cell(grid.width - 1, row);
            const to = board.surfaceGraph.get(edge)[right];
            assert.equal(to.kind, 'wrap');
            const from = parseCellId(edge), next = parseCellId(to.nextCellId);
            pack.ce = [[from.x, from.y, from.z, FACES.indexOf(from.face), FACES.indexOf(next.face)]];
            board.cornerlessEdges.add(makeCornerlessKey(from.x, from.y, from.z, from.face, next.face));
            tile = to.nextCellId;
            const turns = DIRS.filter(dir => dir !== to.nextDir && dir !== OPPOSITE_DIR[to.nextDir]);
            exit = turns[random(turns.length)];
        } else {
            tile = cell(tileColumn, row);
        }
        if (tileMode) {
            addTile(board, pack, tile, tileMode, exit);
            if (tileMode === 'reverse_changer' && !channel && !modes.includes('cornerless') && grid.width >= 6) {
                const end = grid.width - 1;
                add([[end - 1, row], [end, row], [end, row - 1], [end, row - 2]], OPPOSITE_DIR[right]);
            }
        }
        return true;
    }

    // Each new route starts with a real snake. Turns steer into the next tile;
    // a pause continues straight on the next tap and a fork always ends a route.
    function addRoutes(board, pack, modes, random, lessonFace) {
        const tiles = modes.filter(mode => tileCodes[mode]);
        if (!tiles.length) return true;
        const faces = FACES.filter(face => face !== lessonFace);
        const count = Math.min(4, 1 + Math.floor(pack.id / 90) + Number(pack.id % 5 === 0));
        let built = 0;
        for (let attempt = 0; attempt < 70 && built < count && faces.length; attempt++) {
            const faceIndex = random(faces.length);
            const grid = createFaceGrid(pack.size, faces[faceIndex], random);
            const row = 1 + random(grid.height - 3);
            const u = 2 + random(Math.max(1, grid.width - 5));
            const body = [[u, row], [u - 1, row], [u - 2, row], [u - 2, row - 1]];
            let x = u, y = row, dx = 1, dy = 0;
            const route = [];
            const length = Math.min(4, 2 + Number(pack.id >= 80 && (built + pack.id) % 2 === 0)
                + Number(pack.id >= 250 && pack.id % 5 === 0));
            let mode = tiles[(built + 1) % tiles.length];
            for (let i = 0; i < length; i++) {
                const space = dx > 0 ? grid.width - 1 - x : dx < 0 ? x : dy > 0 ? grid.height - 1 - y : y;
                if (!space) break;
                const stride = 1 + random(Math.min(3, space));
                x += dx * stride; y += dy * stride;
                if (mode === 'split_changer' && i + 1 < length && tiles.length > 1) {
                    mode = tiles.find(type => type !== 'split_changer');
                }
                const side = dx ? (y < grid.height / 2 ? 1 : -1) : (x < grid.width / 2 ? 1 : -1);
                if (mode !== 'pause') { [dx, dy] = dx ? [0, side] : [side, 0]; }
                const dir = dx === 1 ? grid.right : dx === -1 ? OPPOSITE_DIR[grid.right]
                    : dy === 1 ? grid.up : OPPOSITE_DIR[grid.up];
                route.push({ cell: grid.cell(x, y), mode, dir });
                if (mode === 'split_changer') break;
                mode = i + 2 === length && tiles.includes('split_changer')
                    ? 'split_changer' : tiles[(built + i + 2) % tiles.length];
            }
            const cells = body.map(([u, v]) => grid.cell(u, v));
            const footprint = cells.concat(route.map(tile => tile.cell));
            if (!route.length || new Set(footprint).size !== footprint.length
                || footprint.some(cell => !board.exposedCells.has(cell) || board.cellOccupancy.has(cell) || board.gimmicks.has(cell))) continue;
            appendSnake(board, pack, cells, grid.right);
            for (const t of route) addTile(board, pack, t.cell, t.mode, t.dir);
            faces.splice(faceIndex, 1);
            built++;
        }
        return built === count && tiles.every(mode => Array.from(board.gimmicks.values()).some(t => t.type === mode));
    }

    // Ordinary snakes only disappear. The small group that can stop or flip tiles
    // needs stronger guarantees: explore all of its legal choices before adding
    // the ordinary snakes. Reject trapped states and repeated pause cycles. Reserve
    // every possible resting body so no ordinary escape route can later be sealed.
    function reachableRestingCells(board) {
        const resting = new Set();
        if (!Array.from(board.gimmicks.values()).some(g => g.type !== 'changer')) return resting;
        const switches = Array.from(board.gimmicks.values()).filter(g => g.type === 'reverse_changer');
        const checked = new Set(), visiting = new Set();
        function explore() {
            if (board.isCleared) return true;
            const key = JSON.stringify([
                board.arrows.map(a => a.removed ? null : [a.fireDir, a.cells]),
                switches.map(g => g.currentReverseDir),
            ]);
            if (checked.has(key)) return true;
            if (visiting.has(key) || checked.size > 8192) return false;
            visiting.add(key);
            const moves = board.collectLegalMoves();
            const poses = board.arrows.map(a => ({ cells: a.cells, fireDir: a.fireDir, removed: a.removed }));
            const dirs = switches.map(g => g.currentReverseDir);
            let any = false;
            for (const m of moves) {
                const res = board.tryTapArrow(m.arrowId, m.tappedCellIndex);
                if (res.outcome !== 'blocked') {
                    any = true;
                    // The game animates a fork into two exiting branches. A branch
                    // that stops or splits again is a different, unsupported puzzle.
                    if (res.traces.some(t => t.splitBranches?.some(leg => leg.steps.some(step =>
                        step.hitGimmick === 'split_changer' || step.hitGimmick === 'pause')))) return false;
                    for (const id of res.pausedArrowIds) {
                        for (const cell of board.arrows[id].cells) resting.add(cell);
                    }
                    if (!explore()) return false;
                }
                board.arrows.forEach((a, i) => Object.assign(a, poses[i]));
                switches.forEach((g, i) => { g.currentReverseDir = dirs[i]; });
                board.rebuildOccupancy();
            }
            visiting.delete(key);
            checked.add(key);
            return any;
        }
        const valid = explore();
        board.movesTaken = 0;
        board.mistakesTaken = 0;
        return valid ? resting : undefined;
    }

    // Build queues into the surface before filling the remaining gaps. The leading
    // snake can leave; each follower needs its predecessor out of its firing lane.
    function addQueues(board, pack, target, random, resting) {
        if (pack.id === 1) return;
        const budget = Math.floor(target * (.20 + .23 * Math.min(1, pack.id / 240)));
        const initial = board.arrows.length;
        for (let attempt = 0; attempt < 130 && board.arrows.length - initial < budget - 1; attempt++) {
            const grid = createFaceGrid(pack.size, FACES[random(6)], random);
            const row = 1 + random(grid.height - 2);
            const sign = random(2) ? 1 : -1;
            const length = 2 + random(Math.max(1, Math.min(6, Math.floor(grid.width / 3)) - 1));
            const lead = grid.width - 1 - random(Math.max(1, grid.width - length * 3 + 1));
            const snakes = [];
            for (let u = lead; u >= 2 && snakes.length < length; u -= 3) {
                const longTail = random(2) === 0;
                const cells = [grid.cell(u, row), grid.cell(u - 1, row), grid.cell(u - 2, row), grid.cell(u - 2, row + sign)];
                if (longTail) cells.push(grid.cell(u - 1, row + sign));
                if (cells.some(c => board.cellOccupancy.has(c) || board.gimmicks.has(c) || !board.exposedCells.has(c))) break;
                snakes.push(cells);
            }
            if (snakes.length < 2) continue;
            // Check the static routes before installing the queue (including the interiors of carved faces).
            const clear = snakes.every(cells => {
                const id = board.arrows.length;
                board.arrows.push({ id, cells, fireDir: grid.right });
                const tr = board.traceArrow(id, false, noDependencies, noDirectionOverrides);
                board.arrows.pop();
                return tr.outcome === 'clear' && !tr.steps.some(step => step.hitGimmick || resting.has(step.cellId));
            });
            if (clear) for (const cells of snakes) appendSnake(board, pack, cells, grid.right);
        }
    }

    function hasFixedExit(board, cells, fireDir, resting) {
        const id = board.arrows.length;
        board.arrows.push({ id, cells, fireDir });
        const trace = board.traceArrow(id, false, noDependencies, noDirectionOverrides);
        board.arrows.pop();
        return trace.outcome === 'clear' && !trace.steps.some(s => s.hitGimmick || resting.has(s.cellId) || cells.includes(s.cellId));
    }

    // Fold a blocking queue back across consecutive lanes. At each turn the last
    // snake's tail enters the next lane and sits directly in front of its leader.
    // Neighbouring bodies touch the firing ray with no vacant cell in between:
    // filling the rest of the board cannot break this order.
    function addFoldedQueue(board, pack, random, resting, length) {
        for (let attempt = 0; attempt < 180; attempt++) {
            const grid = createFaceGrid(pack.size, FACES[random(6)], random);
            const width = Math.min(grid.width, 11 + random(13));
            const left = random(grid.width - width + 1), right = left + width - 1;
            let u = right, v = random(Math.max(1, grid.height - 2 * Math.ceil(length * 4 / width)));
            let sign = 1;
            const snakes = [];
            while (snakes.length < length && v + 2 < grid.height) {
                const room = sign === 1 ? u - left + 1 : right - u + 1;
                if (room < 3) break;
                const span = Math.min(room, 3 + random(3)), tail = u - (span - 1) * sign;
                const turn = room - span < 3;
                const cells = Array.from({ length: span }, (_, i) => grid.cell(u - i * sign, v));
                cells.push(grid.cell(tail, v + 1));
                if (turn) cells.push(grid.cell(tail, v + 2));
                if (cells.some(c => !board.exposedCells.has(c) || board.cellOccupancy.has(c) || board.gimmicks.has(c))) break;
                const fireDir = sign === 1 ? grid.right : OPPOSITE_DIR[grid.right];
                if (!hasFixedExit(board, cells, fireDir, resting)) break;
                snakes.push({ cells, fireDir });
                if (turn) { u = tail + sign; v += 2; sign = -sign; }
                else u = tail - sign;
            }
            if (snakes.length !== length) continue;
            for (const snake of snakes) appendSnake(board, pack, snake.cells, snake.fireDir);
            return true;
        }
        return false;
    }

    // Each tail wraps round the edge and ends just ahead of the next head on the
    // neighbouring face. Clearing the lead snake opens the opposite side of the seam.
    function addEdgeRelay(board, pack, random, resting, wanted) {
        for (let attempt = 0; attempt < 36; attempt++) {
            const grid = createFaceGrid(pack.size, FACES[random(6)], random);
            const { across, neighbour, cell } = adjoiningPanel(grid);
            const forward = CUBE_FRAME[grid.face][OPPOSITE_DIR[grid.up]];
            const otherFireDir = dirFromVector(neighbour, ...forward);
            const length = Math.min(wanted, Math.floor(grid.height / 3));
            if (length < 3) continue;
            let v = random(grid.height - 3 * length + 1);
            let inset = 1 + random(3);
            const snakes = [];
            for (let i = 0; i < length; i++) {
                const other = i % 2 === 1;
                const extra = grid.height - v - 3 * (length - i);
                const bend = v + 2 + random(1 + Math.min(2, extra));
                const nextInset = 1 + random(3);
                const cells = [];
                for (let y = v; y <= bend; y++) cells.push(cell(other, inset, y));
                for (let u = inset - 1; u >= 0; u--) cells.push(cell(other, u, bend));
                for (let u = 0; u <= nextInset; u++) cells.push(cell(!other, u, bend));
                if (cells.some(c => !board.exposedCells.has(c) || board.cellOccupancy.has(c) || board.gimmicks.has(c) || resting.has(c))) break;
                const seam = board.surfaceGraph.get(grid.cell(0, bend))?.[across];
                if (seam?.kind !== 'wrap' || seam.nextCellId !== cell(true, 0, bend)) break;
                const fireDir = other ? otherFireDir : OPPOSITE_DIR[grid.up];
                if (!hasFixedExit(board, cells, fireDir, resting)) break;
                snakes.push({ cells, fireDir });
                v = bend + 1;
                inset = nextInset;
            }
            if (snakes.length < 3) continue;
            for (const snake of snakes) appendSnake(board, pack, snake.cells, snake.fireDir);
            return snakes.length;
        }
        return 0;
    }

    // Each double's far end points directly into the next snake's near end.
    // A single-ended follower closes the far end of the chain. Removing the
    // first snake uncovers the entire exit lane for its neighbour on the other face.
    function addDoubleChain(board, pack, random, resting, count, gated) {
        for (let attempt = 0; attempt < 100; attempt++) {
            const grid = createFaceGrid(pack.size, FACES[random(6)], random);
            const { across, neighbour, cell } = adjoiningPanel(grid);
            const otherTowardEdge = dirFromVector(neighbour, ...FACE_NORMAL[grid.face]);
            const room = grid.height - 2 * count - (gated ? 2 : 0);
            if (room <= 0 || Math.min(grid.width, grid.depth) < 6) continue;
            let v = (gated ? 2 : 0) + random(room);
            let u = pack.id === 15 ? 0 : 2 + random(2);
            const snakes = [];
            if (gated) {
                const cells = [[u - 1, v - 2], [u - 1, v - 1], [u - 1, v], [u - 2, v]]
                    .map(([x, y]) => cell(false, x, y));
                snakes.push({ cells, fireDir: OPPOSITE_DIR[grid.up] });
            }
            for (let i = 0; i <= count; i++) {
                const other = i % 2 === 1;
                const width = other ? grid.depth : grid.width;
                const end = Math.min(width - 1, u + 2 + random(3));
                if (end - u < 2) break;
                const cells = [];
                for (let x = u; x <= end; x++) cells.push(cell(other, x, v));
                const fireDir = other ? otherTowardEdge : across;
                if (i === count) {
                    cells.push(cell(other, end, v - 1));
                    snakes.push({ cells, fireDir });
                    break;
                }
                const spare = grid.height - 1 - v - 2 * (count - i);
                const turn = v + 2 + random(1 + Math.min(spare, 2));
                for (let y = v + 1; y <= turn; y++) cells.push(cell(other, end, y));
                for (let x = end - 1; x >= 0; x--) cells.push(cell(other, x, turn));
                const nextWidth = other ? grid.width : grid.depth;
                const tail = 2 + random(Math.min(3, nextWidth - 5));
                for (let x = 0; x <= tail; x++) cells.push(cell(!other, x, turn));
                const seam = board.surfaceGraph.get(grid.cell(0, turn))?.[across];
                if (seam?.kind !== 'wrap' || seam.nextCellId !== cell(true, 0, turn)) break;
                snakes.push({ cells, fireDir, reverseDir: other ? grid.right : OPPOSITE_DIR[otherTowardEdge] });
                u = tail + 1;
                v = turn;
            }
            if (snakes.length !== count + 1 + Number(gated)) continue;
            const footprint = snakes.flatMap(s => s.cells);
            if (new Set(footprint).size !== footprint.length || footprint.some(c => !board.exposedCells.has(c)
                || board.cellOccupancy.has(c) || board.gimmicks.has(c) || resting.has(c))) continue;
            if (!snakes.every(s => hasFixedExit(board, s.cells, s.fireDir, resting))) continue;
            const chain = [];
            for (const snake of snakes) {
                const double = snake.reverseDir !== undefined;
                const tail = double && random(2) === 0;
                if (double) chain.push({ id: board.arrows.length, tail, face: parseCellId(snake.cells[0]).face });
                appendSnake(board, pack, tail ? snake.cells.reverse() : snake.cells,
                    tail ? snake.reverseDir : snake.fireDir, double ? 1 : 0);
            }
            return chain;
        }
        return undefined;
    }

    function chooseSnake(board, available, random, level, searchCount, resting, challengeBoard) {
        const openRays = new Map();
        const faceLoads = new Map();
        const firstBoard = level === 1;
        for (const snake of board.arrows) {
            const face = parseCellId(snake.cells[0]).face;
            faceLoads.set(face, (faceLoads.get(face) ?? 0) + 1);
            const trace = board.traceArrow(snake.id, false, noDependencies, noDirectionOverrides);
            if (trace.outcome === 'blocked') continue;
            for (const step of trace.steps) {
                if (!board.cellOccupancy.has(step.cellId)) {
                    if (!openRays.has(step.cellId)) openRays.set(step.cellId, []);
                    openRays.get(step.cellId).push(snake.id);
                }
            }
        }
        const tileCells = board.gimmicks;
        const blockingCells = Array.from(openRays.keys());
        let best;
        for (let attempt = 0; attempt < searchCount || (!best && attempt < searchCount * (challengeBoard ? 12 : 4)); attempt++) {
            const pool = blockingCells.length && attempt % 4 < 3 && !firstBoard ? blockingCells : available;
            const head = pool[random(pool.length)];
            if (board.cellOccupancy.has(head) || tileCells.has(head)) continue;
            const face = parseCellId(head).face;
            if (firstBoard && !frontFaces.includes(face)) continue;

            const cells = [head];
            const used = new Set(cells);
            const maxLength = firstBoard ? 5 : Math.min(15, 7 + Math.floor(level / 40));
            const targetLength = minSnakeCells + random(maxLength - minSnakeCells + 1);
            let fireDirection;
            let previousDirection;
            let straightSteps = 0;
            for (let length = 1; length < targetLength; length++) {
                const edges = board.surfaceGraph.get(cells[length - 1]);
                const choices = DIRS.filter(dir => {
                    const next = edges[dir];
                    return next && !used.has(next.nextCellId) && !board.cellOccupancy.has(next.nextCellId)
                        && !tileCells.has(next.nextCellId) && (next.kind === 'flat' || (!firstBoard && length > 2))
                        && (length !== 2 || dir === previousDirection);
                });
                if (!choices.length) break;
                const dir = choices.includes(previousDirection) && (straightSteps < 2 || random(4) !== 0)
                    ? previousDirection : choices[random(choices.length)];
                const next = edges[dir];
                if (length === 1) fireDirection = OPPOSITE_DIR[dir];
                cells.push(next.nextCellId);
                used.add(next.nextCellId);
                straightSteps = dir === previousDirection ? straightSteps + 1 : 1;
                previousDirection = next.nextDir;
            }
            if (cells.length < minSnakeCells) continue;

            // Insert backwards from a clear board. The newly placed snake can leave before
            // any of the occupants its body blocks. State-changing moves are authored separately.
            const id = board.arrows.length;
            board.arrows.push({ id, cells, fireDir: fireDirection });
            const trace = board.traceArrow(id, false, noDependencies, noDirectionOverrides);
            board.arrows.pop();
            if (trace.outcome !== 'clear' || trace.steps.some(step => step.hitGimmick || used.has(step.cellId) || resting.has(step.cellId))) continue;

            const blockers = new Set(cells.flatMap(cell => openRays.get(cell) ?? [])).size;
            const score = Math.min(blockers, firstBoard ? 1 : 4) * (firstBoard ? 8 : 9)
                + (firstBoard ? 0 : Math.min(trace.steps.length, 7) * 3.5) + cells.length * 0.6
                - (faceLoads.get(face) ?? 0) * (firstBoard ? 2 : 0.4) + random(5);
            if (!best || score > best.score) best = { cells, fireDirection, score };
            if (best && attempt >= 17 && blockers >= 2 && trace.steps.length >= 3) break;
        }
        return best;
    }

    // Count forced predecessors only along fixed, single-ended routes. Stateful tiles,
    // alternative ends and linked launches cannot establish a mandatory ordering here.
    function dependencyDepth(board) {
        const next = board.arrows.map(snake => {
            if (snake.isDouble || snake.isBranch) return undefined;
            const trace = board.traceArrow(snake.id, false, noDependencies, noDirectionOverrides);
            if (trace.steps.some(step => step.hitGimmick)) return undefined;
            return trace.blockedByArrowId;
        });
        let longest = 0;
        for (const snake of board.arrows) {
            const seen = new Set([snake.id]);
            let id = snake.id;
            while (next[id] !== undefined && !seen.has(next[id])) {
                id = next[id];
                seen.add(id);
            }
            longest = Math.max(longest, seen.size - 1);
        }
        return longest;
    }

    function openingRelayFaces(board, legalMoves, outerFace) {
        const leads = new Set();
        for (const move of legalMoves) {
            const a = board.arrows[move.arrowId];
            if (a.isBranch || a.isDouble || move.prio !== 0 || !outerFace(a.cells[0])) continue;
            const trace = board.traceArrow(a.id, false, noDependencies, noDirectionOverrides);
            if (!trace.steps.some(step => step.hitGimmick)) leads.add(a.id);
        }
        const pairs = [];
        for (const next of board.arrows) {
            if (next.isBranch || next.isDouble) continue;
            const trace = board.traceArrow(next.id, false, noDependencies, noDirectionOverrides);
            if (!leads.has(trace.blockedByArrowId)) continue;
            const lead = board.arrows[trace.blockedByArrowId];
            const a = outerFace(lead.cells[0]), b = outerFace(next.cells[0]);
            if (!b || a === b) continue;
            // Ignore only the departing snake. A second blocker further down the
            // ray would make the apparent two-tap opening misleading.
            const freed = board.traceArrow(next.id, false, new Set(lead.cells), noDirectionOverrides);
            if (freed.outcome === 'clear' && !freed.steps.some(step => step.hitGimmick)) pairs.push([a, b]);
        }
        return pairs;
    }

    function frameOpening(pack, board, legalMoves, modes, doubleChain) {
        const ends = new Set();
        for (const move of legalMoves) {
            const snake = board.arrows[move.arrowId];
            ends.add(snake.cells[move.tappedCellIndex]);
            for (const id of board.linkGroups.get(snake.linkGroup) ?? []) ends.add(board.arrows[id].cells[0]);
        }
        // A head inside a recess can face the camera but sit behind the rim.
        // Count outer-face endpoints so every accepted opening has a clear line of sight.
        const outerFace = cellId => {
            const cell = parseCellId(cellId);
            const axis = cell.face[1];
            const edge = cell.face[0] === '+' ? pack.size['xyz'.indexOf(axis)] - 1 : 0;
            return cell[axis] === edge ? cell.face : undefined;
        };
        const faces = Array.from(ends, outerFace).filter(Boolean);
        const relays = hasCubeAwayEdgeRelay(pack.id) ? openingRelayFaces(board, legalMoves, outerFace) : [];
        const [yaw, pitch] = pack.cam;
        const axisFace = (axis, value) => (value > 0 ? '+' : '-') + axis;
        const early = pack.id <= 20;
        const heads = pack.arrows.map(arrow => FACES[arrow.h[3]]);
        let bestPairs = -1, bestCount = -1;
        for (const tilt of [pitch, -pitch]) {
            for (const spin of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
                const angle = yaw + spin;
                const visible = [axisFace('x', -Math.sin(angle)), axisFace('z', Math.cos(angle)), axisFace('y', tilt)];
                if (pack.id === 15 && !doubleChain.every(step => visible.includes(step.face))) continue;
                if (faces.filter(face => visible.includes(face)).length < (early ? 2 : 1)) continue;
                if (early && modes.length && !visible.includes(heads[0])) continue;
                const count = early ? heads.filter(face => visible.includes(face)).length : 0;
                if (early && count < Math.ceil(heads.length * .55)) continue;
                const shown = relays.filter(pair => pair.every(face => visible.includes(face))).length;
                if (pack.id === 13 && !shown) continue;
                if (shown < bestPairs || (shown === bestPairs && count <= bestCount)) continue;
                bestPairs = shown;
                bestCount = count;
                pack.cam = [angle, tilt, pack.cam[2], pack.cam[3]];
                if (!early && shown === relays.length) return true;
            }
        }
        return bestCount >= 0;
    }

    function verifySolution(pack, modes, challenge, doubleChain) {
        const board = new CubeAwayBoard(pack);
        const occupied = new Set();
        for (const snake of board.arrows) {
            if (snake.cells.length < minSnakeCells) return false;
            for (const cell of snake.cells) {
                if (occupied.has(cell) || !board.exposedCells.has(cell)) return false;
                occupied.add(cell);
            }
        }
        const open = board.collectFireableArrowIds().length;
        if (open < challenge.minOpen || open > challenge.maxOpen) return false;
        for (const [i, step] of doubleChain.entries()) {
            const trace = tail => board.traceArrow(step.id, tail, noDependencies, noDirectionOverrides);
            if (trace(!step.tail).blockedByArrowId !== step.id + 1) return false;
            if (i > 0 && trace(step.tail).blockedByArrowId !== doubleChain[i - 1].id) return false;
            if (pack.id === 15 && i === 0 && trace(step.tail).outcome !== 'clear') return false;
        }
        const lastDouble = doubleChain[doubleChain.length - 1];
        if (lastDouble && board.traceArrow(lastDouble.id + 1, false, noDependencies, noDirectionOverrides).blockedByArrowId !== lastDouble.id) return false;
        if (!frameOpening(pack, board, board.collectLegalMoves(), modes, doubleChain)) return false;
        const depth = dependencyDepth(board);
        if (depth < challenge.minDepth) return false;

        // Check the original lesson and follow every additional tile in a legal playthrough.
        const primary = modes.find(mode => tileCodes[mode]);
        const lesson = modes.filter(mode => !tileCodes[mode] || mode === primary);
        const visitedTiles = new Set();
        let demonstrated = lesson.length === 0;
        let doublesCleared = 0;
        for (let n = 0; n <= pack.arrows.length * 2 && !board.isCleared; n++) {
            let move;
            if (!demonstrated && modes.includes('double')) {
                move = board.collectLegalMoves().find(m => m.arrowId === 0 && m.tappedCellIndex > 0);
            }
            move ??= board.findHint();
            if (!move) return false;
            const result = board.tryTapArrow(move.arrowId, move.tappedCellIndex);
            if (!result.accepted || result.outcome === 'blocked') return false;
            const step = doubleChain[doublesCleared];
            if (step && move.arrowId === step.id) {
                if (result.outcome !== 'clear' || result.traces[0].useTail !== step.tail) return false;
                doublesCleared++;
                const next = doubleChain[doublesCleared];
                if (next && board.traceArrow(next.id, next.tail, noDependencies, noDirectionOverrides).outcome !== 'clear') return false;
            }
            for (const tr of result.traces) {
                for (const leg of [tr, ...(tr.splitBranches ?? [])]) {
                    for (const step of leg.steps) if (step.hitGimmick) visitedTiles.add(step.cellId);
                }
            }
            demonstrated ||= result.traces.some(trace => lesson.every(mode => {
                if (mode === 'double') return trace.useTail && board.arrows[trace.arrowId].isDouble;
                if (mode === 'branch') return result.firedArrowIds.length + result.pausedArrowIds.length > 1;
                if (mode === 'carved') return trace.steps.some(step => step.isHollowJump);
                if (mode === 'cornerless') return trace.steps.some(step => step.crossedCornerless);
                return trace.steps.some(step => step.hitGimmick === mode);
            }));
        }
        return board.isCleared && demonstrated && visitedTiles.size === board.gimmicks.size && doublesCleared === doubleChain.length;
    }

    // The opening can be tight even when most of the middle is freely tappable.
    // Sample the remaining choices at three points on two independent legal routes.
    function middleOpenShare(pack) {
        let widest = 0;
        for (const seed of [0x51b83, 0x29df1]) {
            const random = createRandom(Math.imul(pack.id, seed));
            const board = new CubeAwayBoard(pack);
            const sampleAt = [.65, .50, .35].map(part => Math.floor(pack.arrows.length * part));
            let sample = 0, totalShare = 0;
            for (let step = 0; step < pack.arrows.length * 2 && sample < sampleAt.length; step++) {
                const remaining = board.remainingCount;
                if (remaining <= sampleAt[sample]) {
                    totalShare += board.collectFireableArrowIds().length / remaining;
                    if (++sample === sampleAt.length) break;
                }
                const moves = board.collectLegalMoves();
                if (!moves.length) return Infinity;
                const move = moves[random(moves.length)];
                if (board.tryTapArrow(move.arrowId, move.tappedCellIndex).outcome === 'blocked') return Infinity;
            }
            if (sample !== sampleAt.length) return Infinity;
            widest = Math.max(widest, totalShare / sample);
        }
        return widest;
    }

    function createLevel(id, modes, retry) {
        const random = createRandom((Math.imul(id + 39, 0x9e3779b9) ^ Math.imul(retry + 19, 0x85ebca6b)) >>> 0);
        const difficulty = cubeAwayDifficulty(id);
        const challenge = challengeForLevel(id, difficulty);
        const { target } = challenge;
        const profiles = [[1, 1, 1], [1.48, .81, .91], [.63, 1.26, 1.24], [1.52, 1.16, .56],
            [1.23, 1.01, .80], [.84, 1.62, .77], [1.15, .76, 1.30]];
        const profile = profiles[id === 1 ? 0 : (id + Math.floor(id / 7)) % profiles.length];
        const challengeBoard = difficulty !== 'normal';
        const side = id === 1 ? 7 : Math.sqrt(target * (5.3 + Math.min(id / 105, 2.9)) / (challengeBoard ? 2.6 : 3.05));
        const axes = random(3);
        const size = [0, 1, 2].map(i => Math.max(6, Math.ceil(side * profile[(i + axes) % 3])));
        const pack = { id, size, cam: [0.66 + (random(13) - 6) * 0.018, 0.44 + (random(9) - 4) * 0.012, 1, 0], arrows: [] };
        const grid = createFaceGrid(size, frontFaces[random(frontFaces.length)], random);
        let channel;
        if (modes.includes('carved')) {
            // A recessed channel is real geometry, with enough solid surface on either lip
            // for the forward ray to land on the other side of the cut.
            const { width, height, depth, span } = grid;
            const cut = 3 + random(width - 4);
            const gapWidth = width - cut > 2 ? 1 + random(2) : 1;
            const row = 2 + random(height - 4);
            const y0 = random(row + 1);
            const y1 = row + random(height - row);
            const recess = 1 + random(Math.max(1, Math.floor(depth * .45)));
            channel = { row, cut, landing: cut + gapWidth };
            // Profile the solid in the face's coordinate system. Keep both lips at the
            // same elevation along the lesson row so the hollow jump always has a landing.
            const style = id % 4;
            const spans = [span(0, 0, 0, cut - 1, height - 1, depth - 1)];
            for (let v = 0; v < height; v++) {
                const gap = v >= y0 && v <= y1;
                let gapDepth = gap ? depth - recess : depth;
                let bankDepth = depth;
                if (style === 1 && v < row) bankDepth -= Math.floor((row - v) / 2);
                if (style === 2 && v !== row && gap) gapDepth = Math.max(1, gapDepth - Math.abs(v - row));
                if (style === 3 && v > row && v < height - 1 && gap) gapDepth = 0;
                if (gapDepth > 0) spans.push(span(cut, v, 0, cut + gapWidth - 1, v, gapDepth - 1));
                spans.push(span(cut + gapWidth, v, 0, width - 1, v, Math.max(1, bankDepth) - 1));
            }
            pack.vox = spans;
        }
        const board = new CubeAwayBoard(pack);
        if (!addLesson(board, pack, modes, random, grid, channel)) return undefined;
        if (!addRoutes(board, pack, modes, random, grid.face)) return undefined;
        const resting = reachableRestingCells(board);
        if (!resting) return undefined;
        let doubleChain = [];
        if (hasCubeAwayDoubleChain(id)) {
            const count = id % 40 === 0 ? (id >= 240 ? 4 : 3) : 2 + Number(id >= 100 && id % 20 === 15);
            doubleChain = addDoubleChain(board, pack, random, resting, count, id % 20 === 14 || id % 40 === 0);
            if (!doubleChain) return undefined;
        }
        if (challengeBoard && !addFoldedQueue(board, pack, random, resting, challenge.minDepth + 1)) return undefined;
        const start = board.arrows.length;
        const extendQueues = doubleChain.length > 0 && id !== 15 && retry % 3 !== 0;
        const edgeShare = hasCubeAwayEdgeRelay(id) ? (challengeBoard ? .17 : .10) : extendQueues ? .08 : 0;
        if (edgeShare) {
            const budget = Math.ceil(target * edgeShare);
            while (board.arrows.length - start < budget) {
                if (!addEdgeRelay(board, pack, random, resting, 3 + random(challengeBoard ? 5 : 3))) break;
            }
            if (hasCubeAwayEdgeRelay(id) && board.arrows.length - start < Math.max(3, Math.ceil(budget / 3))) return undefined;
        }
        if (challengeBoard || extendQueues) {
            const queueShare = extendQueues ? (challengeBoard ? .36 : .19) : .26;
            while (board.arrows.length - start < Math.floor(target * queueShare)) {
                if (!addFoldedQueue(board, pack, random, resting, 5 + random(6))) break;
            }
        }
        addQueues(board, pack, target, random, resting);
        const available = Array.from(board.exposedCells).sort();
        while (pack.arrows.length < target) {
            const snake = chooseSnake(board, available, random, id, 180, resting, challengeBoard);
            if (!snake) return undefined;
            appendSnake(board, pack, snake.cells, snake.fireDirection);
        }
        if (!verifySolution(pack, modes, challenge, doubleChain)) return undefined;

        // Sorting by the full path makes duplicate detection independent of display color and arrow order.
        const layout = JSON.stringify([pack.size, pack.vox ?? [], pack.ce ?? [], pack.gim ?? [],
            pack.arrows.map(arrow => JSON.stringify(arrow)).sort()]);
        if (seenLayouts.has(layout)) return undefined;
        return { pack, difficulty, layout };
    }

    function selectLevel(id, modes) {
        const compareMiddle = hasCubeAwayDoubleChain(id) && id !== 15;
        let best, bestShare = Infinity, playtested = 0;
        for (let retry = 0; retry < 160; retry++) {
            const candidate = createLevel(id, modes, retry);
            if (!candidate) continue;
            if (!compareMiddle) return candidate;
            const share = middleOpenShare(candidate.pack);
            if (!Number.isFinite(share)) continue;
            if (share < bestShare) { best = candidate; bestShare = share; }
            const target = candidate.difficulty === 'expert' ? .15 : candidate.difficulty === 'hard' ? .17 : id % 20 === 7 ? .23 : .20;
            playtested++;
            if (bestShare <= target || playtested === 5) break;
        }
        return best;
    }

    for (const [index, title] of chapters.entries()) {
        const chapter = index + 1;
        const startLevel = index * levelsPerChapter + 1;
        const levels = [];
        const mechanics = new Set();
        for (let slot = 0; slot < levelsPerChapter; slot++) {
            const id = startLevel + slot;
            const modes = mechanicsForLevel(id);
            const generated = selectLevel(id, modes);
            if (!generated) throw new Error(`Unable to build a verified original board for level ${id} (${modes})`);
            const { pack, difficulty } = generated;
            seenLayouts.add(generated.layout);
            levels.push(pack);
            if (hasCubeAwayDoubleChain(id) && !modes.includes('double')) modes.push('double');
            for (const mode of modes) mechanics.add(mode);
            levelIndex.push({ id, ch: chapter, ac: pack.arrows.length, sz: pack.size, difficulty, m: modes });
        }
        const allMechs = Array.from(mechanics);
        const newMechs = allMechs.filter(mechanic => !seenMechanics.has(mechanic));
        allMechs.forEach(mechanic => seenMechanics.add(mechanic));
        chapterIndex.push({ chapter, title, desc: '', startLevel, endLevel: startLevel + levelsPerChapter - 1, allMechs, newMechs });
        files.set(`ch_${String(chapter).padStart(2, '0')}.json`, { bankId: CUBE_AWAY_LEVEL_BANK, chapter, levels });
        console.log(`Chapter ${chapter}/${chapters.length}: levels ${startLevel}–${startLevel + levelsPerChapter - 1} verified`);
    }
    files.set('index.json', {
        bankId: CUBE_AWAY_LEVEL_BANK, schemaVersion: 1, totalLevels: levelIndex.length,
        totalChapters: chapters.length, levelsPerChapter, chapters: chapterIndex, levels: levelIndex,
    });
    return files;
}

function main() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-snake-bank-'));
    try {
        execFileSync('tsc', [
            '--module', 'commonjs', '--target', 'es2020', '--outDir', temp,
            path.join(scripts, 'CubeAwayEngine.ts'),
        ], { stdio: 'inherit' });
        const files = generateBank(require(path.join(temp, 'CubeAwayEngine.js')), require(path.join(temp, 'CubeAwayTypes.js')));
        const check = process.argv.includes('--check');
        const obsolete = fs.readdirSync(output).filter(name => /^ch_\d{2}\.json(?:\.meta)?$/.test(name)
            && !files.has(name.replace(/\.meta$/, '')));
        if (check) assert.deepEqual(obsolete, [], 'Remove chapter assets outside the current bank');
        for (const [name, contents] of files) {
            const file = path.join(output, name);
            const encoded = JSON.stringify(contents) + '\n';
            if (check) assert.equal(fs.readFileSync(file, 'utf8'), encoded, `Regenerate ${name} from the original bank builder`);
            else fs.writeFileSync(file, encoded);
        }
        for (const name of obsolete) fs.unlinkSync(path.join(output, name));
        console.log(`${check ? 'Reproduced' : 'Wrote'} ${files.size - 1} original chapter packs`);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

main();
