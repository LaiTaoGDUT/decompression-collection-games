import {
    ArrowRuntime,
    CUBE_FRAME,
    DIR_CHARS,
    DIRS,
    DirName,
    FACE_NORMAL,
    FACES,
    FaceName,
    formatCellId,
    GIMMICK_CODE_TO_TYPE,
    GimmickRuntime,
    OPPOSITE_DIR,
    resolveSplitExits,
    OPPOSITE_FACE,
    parseCellId,
    PathStep,
    PausedSnakePosition,
    RawLevelPack,
    SplitBranchPath,
    SurfaceNeighbor,
    TapResolution,
    TraceResult,
} from './CubeAwayTypes';

const MAX_TRACE_STEPS = 200;

export function makeVoxelKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
}

export function makeCornerlessKey(x: number, y: number, z: number, f1: FaceName, f2: FaceName): string {
    return f1 < f2 ? `${x},${y},${z}:${f1}|${f2}` : `${x},${y},${z}:${f2}|${f1}`;
}

export function computeCornerlessTraversal(
    fromCellId: string,
    toCellId: string,
    cornerlessSet: Set<string>,
    kind: 'wrap' | 'concave' = 'wrap',
): boolean {
    const a = parseCellId(fromCellId);
    const b = parseCellId(toCellId);
    if (cornerlessSet.has(makeCornerlessKey(a.x, a.y, a.z, a.face, b.face))) return true;
    if (cornerlessSet.has(makeCornerlessKey(b.x, b.y, b.z, a.face, b.face))) return true;
    if (kind === 'concave') {
        // Concave edges on source/target voxels meet the opposite face of the perpendicular step.
        if (cornerlessSet.has(makeCornerlessKey(a.x, a.y, a.z, a.face, OPPOSITE_FACE[b.face]))) return true;
        if (cornerlessSet.has(makeCornerlessKey(b.x, b.y, b.z, b.face, OPPOSITE_FACE[a.face]))) return true;
    }
    return false;
}

export function dirFromVector(face: FaceName, dx: number, dy: number, dz: number): DirName | null {
    const frame = CUBE_FRAME[face];
    for (let i = 0; i < DIRS.length; i++) {
        const d = DIRS[i];
        const v = frame[d];
        if (v[0] === dx && v[1] === dy && v[2] === dz) return d;
    }
    return null;
}

export function faceFromNormal(nx: number, ny: number, nz: number): FaceName | null {
    for (let i = 0; i < FACES.length; i++) {
        const f = FACES[i];
        const v = FACE_NORMAL[f];
        if (v[0] === nx && v[1] === ny && v[2] === nz) return f;
    }
    return null;
}

/**
 * Pure headless puzzle state and path-tracing engine matching Cube Away's
 * 3D voxel, cornerless wrap, gimmick, double-arrow, and linked-branch semantics.
 */
export class CubeAwayBoard {
    readonly levelId: number;
    readonly sizeX: number;
    readonly sizeY: number;
    readonly sizeZ: number;
    readonly defaultCamera: readonly [number, number, number, number];
    readonly solidSpans?: readonly (readonly number[])[];
    readonly voxels: Set<string>;
    readonly exposedCells: Set<string>;
    readonly surfaceGraph: Map<string, Partial<Record<DirName, SurfaceNeighbor>>>;
    readonly cornerlessEdges: Set<string>;
    readonly gimmicks: Map<string, GimmickRuntime>;
    readonly arrows: ArrowRuntime[];
    readonly linkGroups: Map<number, number[]>;
    readonly cellOccupancy: Map<string, number[]>;

    movesTaken = 0;
    mistakesTaken = 0;

    constructor(pack: RawLevelPack) {
        this.levelId = pack.id;
        this.sizeX = pack.size[0];
        this.sizeY = pack.size[1];
        this.sizeZ = pack.size[2];
        this.defaultCamera = [pack.cam[0], pack.cam[1], pack.cam[2], pack.cam[3]];

        this.solidSpans = pack.vox;
        this.voxels = this.buildVoxelSet(pack);
        this.exposedCells = new Set<string>();
        this.surfaceGraph = new Map<string, Partial<Record<DirName, SurfaceNeighbor>>>();
        this.buildSurfaceGraph();

        this.cornerlessEdges = new Set<string>();
        if (pack.ce) {
            for (const entry of pack.ce) {
                const f1 = FACES[entry[3]];
                const f2 = FACES[entry[4]];
                this.cornerlessEdges.add(makeCornerlessKey(entry[0], entry[1], entry[2], f1, f2));
            }
        }

        this.gimmicks = new Map<string, GimmickRuntime>();
        if (pack.gim) {
            for (const g of pack.gim) {
                const face = FACES[g[3]];
                const cellId = formatCellId(g[0], g[1], g[2], face);
                const type = GIMMICK_CODE_TO_TYPE[g[4]];
                const exitDir = g[5] >= 0 ? DIRS[g[5]] : undefined;
                const exitDir2 = g[6] >= 0 ? DIRS[g[6]] : undefined;
                this.gimmicks.set(cellId, {
                    cellId,
                    x: g[0],
                    y: g[1],
                    z: g[2],
                    face,
                    type,
                    exitDir,
                    exitDir2,
                    currentReverseDir: type === 'reverse_changer' ? exitDir : undefined,
                });
            }
        }

        this.arrows = [];
        this.linkGroups = new Map<number, number[]>();
        for (let i = 0; i < pack.arrows.length; i++) {
            const raw = pack.arrows[i];
            const headCell = formatCellId(raw.h[0], raw.h[1], raw.h[2], FACES[raw.h[3]]);
            const cells = this.decodeArrowCells(headCell, raw.r);
            const arrow: ArrowRuntime = {
                id: i,
                cells,
                fireDir: DIRS[raw.d],
                isDouble: (raw.f & 1) !== 0,
                isBranch: (raw.f & 2) !== 0,
                linkGroup: raw.g,
                colorIndex: i,
                removed: false,
            };
            this.arrows.push(arrow);
            if (arrow.linkGroup > 0) {
                const list = this.linkGroups.get(arrow.linkGroup) ?? [];
                list.push(i);
                this.linkGroups.set(arrow.linkGroup, list);
            }
        }

        this.cellOccupancy = new Map<string, number[]>();
        this.rebuildOccupancy();
    }

    private buildVoxelSet(pack: RawLevelPack): Set<string> {
        const set = new Set<string>();
        if (!pack.vox) {
            for (let x = 0; x < this.sizeX; x++) {
                for (let y = 0; y < this.sizeY; y++) {
                    for (let z = 0; z < this.sizeZ; z++) {
                        set.add(makeVoxelKey(x, y, z));
                    }
                }
            }
            return set;
        }
        for (const span of pack.vox) {
            for (let x = span[0]; x <= span[3]; x++) {
                for (let y = span[1]; y <= span[4]; y++) {
                    for (let z = span[2]; z <= span[5]; z++) {
                        set.add(makeVoxelKey(x, y, z));
                    }
                }
            }
        }
        return set;
    }

    private buildSurfaceGraph(): void {
        const voxelCoords: Array<{ x: number; y: number; z: number }> = [];
        this.voxels.forEach((key) => {
            const c1 = key.indexOf(',');
            const c2 = key.indexOf(',', c1 + 1);
            const x = parseInt(key.slice(0, c1), 10);
            const y = parseInt(key.slice(c1 + 1, c2), 10);
            const z = parseInt(key.slice(c2 + 1), 10);
            voxelCoords.push({ x, y, z });
            for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const [nx, ny, nz] = FACE_NORMAL[face];
                if (!this.voxels.has(makeVoxelKey(x + nx, y + ny, z + nz))) {
                    this.exposedCells.add(formatCellId(x, y, z, face));
                }
            }
        });

        for (const { x, y, z } of voxelCoords) {
            for (let fi = 0; fi < FACES.length; fi++) {
                const face = FACES[fi];
                const cellId = formatCellId(x, y, z, face);
                if (!this.exposedCells.has(cellId)) continue;
                const [nx, ny, nz] = FACE_NORMAL[face];
                const map: Partial<Record<DirName, SurfaceNeighbor>> = {};

                for (let di = 0; di < DIRS.length; di++) {
                    const dir = DIRS[di];
                    const [dx, dy, dz] = CUBE_FRAME[face][dir];

                    // 1. Flat same-face step
                    const flatId = formatCellId(x + dx, y + dy, z + dz, face);
                    if (this.exposedCells.has(flatId)) {
                        map[dir] = { nextCellId: flatId, nextDir: dir, kind: 'flat' };
                        continue;
                    }

                    // 2. Convex wrap onto perpendicular face of the same voxel
                    const wrapFace = faceFromNormal(dx, dy, dz);
                    if (wrapFace) {
                        const wrapId = formatCellId(x, y, z, wrapFace);
                        if (this.exposedCells.has(wrapId)) {
                            const mapped = dirFromVector(wrapFace, -nx, -ny, -nz);
                            if (mapped) {
                                map[dir] = { nextCellId: wrapId, nextDir: mapped, kind: 'wrap' };
                                continue;
                            }
                        }

                        // 3. Concave inner-corner staircase step
                        const concaveFace = OPPOSITE_FACE[wrapFace];
                        const concaveId = formatCellId(x + nx + dx, y + ny + dy, z + nz + dz, concaveFace);
                        if (this.exposedCells.has(concaveId)) {
                            const mapped = dirFromVector(concaveFace, nx, ny, nz);
                            if (mapped) {
                                map[dir] = { nextCellId: concaveId, nextDir: mapped, kind: 'concave' };
                                continue;
                            }
                        }
                    }
                }
                this.surfaceGraph.set(cellId, map);
            }
        }
    }

    private decodeArrowCells(headCell: string, rle?: string): string[] {
        const cells = [headCell];
        if (!rle || rle.length === 0) return cells;
        let cur = headCell;
        let i = 0;
        while (i < rle.length) {
            const dc = rle[i++];
            const dir = DIR_CHARS[dc];
            let numStr = '';
            while (i < rle.length && rle[i] >= '0' && rle[i] <= '9') {
                numStr += rle[i++];
            }
            const rep = numStr.length > 0 ? parseInt(numStr, 10) : 1;
            for (let k = 0; k < rep; k++) {
                const nb = this.surfaceGraph.get(cur)?.[dir];
                if (!nb) break;
                cur = nb.nextCellId;
                cells.push(cur);
            }
        }
        return cells;
    }

    rebuildOccupancy(): void {
        this.cellOccupancy.clear();
        for (let i = 0; i < this.arrows.length; i++) {
            const a = this.arrows[i];
            if (a.removed) continue;
            for (let c = 0; c < a.cells.length; c++) {
                const cid = a.cells[c];
                const list = this.cellOccupancy.get(cid);
                if (list) list.push(i);
                else this.cellOccupancy.set(cid, [i]);
            }
        }
    }

    getPausedSnakes(): PausedSnakePosition[] {
        return this.arrows.filter(a => !a.removed && this.gimmicks.get(a.cells[0])?.type === 'pause')
            .map(a => ({ id: a.id, cells: a.cells.slice(), fireDir: a.fireDir }));
    }

    restorePausedSnakes(poses: readonly PausedSnakePosition[]): void {
        for (const pose of poses) {
            const arrow = this.arrows[pose.id];
            if (!arrow || arrow.removed || pose.cells.length !== arrow.cells.length
                || this.gimmicks.get(pose.cells[0])?.type !== 'pause'
                || !pose.cells.every(cell => this.exposedCells.has(cell))) continue;
            arrow.cells = pose.cells.slice();
            arrow.fireDir = pose.fireDir;
        }
        this.rebuildOccupancy();
    }

    get remainingCount(): number {
        let count = 0;
        for (let i = 0; i < this.arrows.length; i++) {
            if (!this.arrows[i].removed) count++;
        }
        return count;
    }

    get isCleared(): boolean {
        return this.remainingCount === 0;
    }

    /** Compute forward launch direction when launching from arrow tail (double arrow). */
    computeTailFireDir(arrow: ArrowRuntime): DirName {
        const len = arrow.cells.length;
        if (len < 2) return OPPOSITE_DIR[arrow.fireDir];
        const tail = arrow.cells[len - 1];
        const prev = arrow.cells[len - 2];
        const edges = this.surfaceGraph.get(tail);
        if (edges) {
            for (let i = 0; i < DIRS.length; i++) {
                const d = DIRS[i];
                if (edges[d]?.nextCellId === prev) {
                    return OPPOSITE_DIR[d];
                }
            }
        }
        return OPPOSITE_DIR[arrow.fireDir];
    }

    /** Two surface cells on opposite lips of an opening visible from outside the board. */
    findHollowCrossing(): { from: string; to: string } | undefined {
        if (!this.solidSpans || this.voxels.size === this.sizeX * this.sizeY * this.sizeZ) return;
        const onOuterFace = (cell: string): boolean => {
            const { x, y, z, face } = parseCellId(cell);
            const [nx, ny, nz] = FACE_NORMAL[face];
            return x + nx < 0 || x + nx >= this.sizeX || y + ny < 0 || y + ny >= this.sizeY
                || z + nz < 0 || z + nz >= this.sizeZ;
        };
        const depCells = new Set<string>(), overrides = new Map<string, DirName>();
        for (const arrow of this.arrows) {
            if (arrow.removed) continue;
            for (const tail of arrow.isDouble ? [false, true] : [false]) {
                const trace = this.traceArrow(arrow.id, tail, depCells, overrides);
                let previous = arrow.cells[tail ? arrow.cells.length - 1 : 0];
                for (const step of trace.steps) {
                    if (step.isHollowJump && onOuterFace(previous)) return { from: previous, to: step.cellId };
                    previous = step.cellId;
                }
            }
        }
        // The demonstration must also work when its snake has already left or is blocked.
        for (const from of Array.from(this.exposedCells)) {
            if (!onOuterFace(from)) continue;
            const edges = this.surfaceGraph.get(from);
            for (const dir of DIRS) {
                const edge = edges?.[dir];
                if (edge && (edge.kind !== 'wrap' || computeCornerlessTraversal(from, edge.nextCellId, this.cornerlessEdges))) continue;
                const ray = this.castHollowRay(from, dir);
                if (ray && !ray.hitPerpendicularWall) return { from, to: ray.cellId };
            }
        }
    }

    /** Same-plane hollow raycast across carved gaps (CrossSurfaceCollisionChecker). */
    private castHollowRay(cellId: string, dir: DirName): { cellId: string; dir: DirName; hitPerpendicularWall: boolean } | null {
        const { x, y, z, face } = parseCellId(cellId);
        const [dx, dy, dz] = CUBE_FRAME[face][dir];
        const [nx, ny, nz] = FACE_NORMAL[face];
        let step = 1;
        while (true) {
            step++;
            const tx = x + dx * step;
            const ty = y + dy * step;
            const tz = z + dz * step;
            if (tx < 0 || tx >= this.sizeX || ty < 0 || ty >= this.sizeY || tz < 0 || tz >= this.sizeZ) {
                return null;
            }
            if (this.voxels.has(makeVoxelKey(tx + nx, ty + ny, tz + nz))) {
                // Raised wall sits perpendicular across the flight path
                return { cellId: formatCellId(tx, ty, tz, face), dir, hitPerpendicularWall: true };
            }
            const targetId = formatCellId(tx, ty, tz, face);
            if (this.exposedCells.has(targetId)) {
                return { cellId: targetId, dir, hitPerpendicularWall: false };
            }
        }
    }

    private findExternalBlocker(cellId: string, firingArrowId: number, depCells: Set<string>): number | undefined {
        const owners = this.cellOccupancy.get(cellId);
        if (!owners) return undefined;
        for (let i = 0; i < owners.length; i++) {
            const owner = owners[i];
            if (owner !== firingArrowId && !depCells.has(cellId)) {
                return owner;
            }
        }
        return undefined;
    }

    /**
     * Trace a single arrow's launch trajectory (read-only: does not mutate board state).
     */
    traceArrow(
        arrowId: number,
        useTail: boolean,
        depCells: Set<string>,
        reverseOverrides: Map<string, DirName>,
    ): TraceResult {
        const arrow = this.arrows[arrowId];
        const startCell = useTail ? arrow.cells[arrow.cells.length - 1] : arrow.cells[0];
        const startDir = useTail ? this.computeTailFireDir(arrow) : arrow.fireDir;
        const localReverse = new Map<string, DirName>(reverseOverrides);

        const traceRay = (
            originCell: string,
            originDir: DirName,
            initialCell: string,
            baseSteps: number,
        ): {
            outcome: 'clear' | 'pause' | 'blocked';
            steps: PathStep[];
            finalDir: DirName;
            blockedBy?: number;
            blockerCell?: string;
            splitBranches?: [SplitBranchPath, SplitBranchPath];
        } => {
            let cur = originCell;
            let dir = originDir;
            const steps: PathStep[] = [];
            let count = baseSteps;

            while (count < MAX_TRACE_STEPS) {
                count++;
                const nb = this.surfaceGraph.get(cur)?.[dir];
                let nextCell: string;
                let nextDir: DirName;
                let crossedCornerless = false;
                let isHollowJump = false;

                if (nb) {
                    if (nb.kind === 'wrap' || nb.kind === 'concave') {
                        if (computeCornerlessTraversal(cur, nb.nextCellId, this.cornerlessEdges, nb.kind)) {
                            nextCell = nb.nextCellId;
                            nextDir = nb.nextDir;
                            crossedCornerless = true;
                        } else if (nb.kind === 'concave') {
                            return { outcome: 'blocked', steps, finalDir: dir, blockerCell: nb.nextCellId };
                        } else {
                            const ray = this.castHollowRay(cur, dir);
                            if (!ray) {
                                return { outcome: 'clear', steps, finalDir: dir };
                            }
                            if (ray.hitPerpendicularWall) {
                                return { outcome: 'blocked', steps, finalDir: dir, blockerCell: ray.cellId };
                            }
                            nextCell = ray.cellId;
                            nextDir = ray.dir;
                            isHollowJump = true;
                        }
                    } else {
                        nextCell = nb.nextCellId;
                        nextDir = nb.nextDir;
                    }
                } else {
                    const ray = this.castHollowRay(cur, dir);
                    if (!ray) {
                        return { outcome: 'clear', steps, finalDir: dir };
                    }
                    if (ray.hitPerpendicularWall) {
                        return { outcome: 'blocked', steps, finalDir: dir, blockerCell: ray.cellId };
                    }
                    nextCell = ray.cellId;
                    nextDir = ray.dir;
                    isHollowJump = true;
                }

                const blocker = this.findExternalBlocker(nextCell, arrowId, depCells);
                if (blocker !== undefined) {
                    return {
                        outcome: 'blocked',
                        steps,
                        finalDir: nextDir,
                        blockedBy: blocker,
                        blockerCell: nextCell,
                    };
                }

                const gimmick = this.gimmicks.get(nextCell);
                steps.push({
                    cellId: nextCell,
                    dir: nextDir,
                    crossedCornerless,
                    isHollowJump,
                    hitGimmick: gimmick?.type,
                });

                cur = nextCell;
                dir = nextDir;

                if (gimmick) {
                    if (gimmick.type === 'pause') {
                        if (cur !== initialCell) {
                            return { outcome: 'pause', steps, finalDir: dir };
                        }
                    } else if (gimmick.type === 'changer') {
                        if (gimmick.exitDir) {
                            dir = gimmick.exitDir;
                        }
                    } else if (gimmick.type === 'reverse_changer') {
                        const activeDir = localReverse.get(cur) ?? gimmick.currentReverseDir ?? gimmick.exitDir;
                        if (activeDir) {
                            localReverse.set(cur, OPPOSITE_DIR[activeDir]);
                            dir = activeDir;
                        }
                    } else if (gimmick.type === 'split_changer') {
                        const [d1, d2] = resolveSplitExits(gimmick.exitDir ?? dir, gimmick.exitDir2);
                        const r1 = traceRay(cur, d1, cur, count);
                        const r2 = traceRay(cur, d2, cur, count);
                        const branch1: SplitBranchPath = {
                            steps: r1.steps,
                            finalDir: r1.finalDir,
                            blockedByArrowId: r1.blockedBy,
                        };
                        const branch2: SplitBranchPath = {
                            steps: r2.steps,
                            finalDir: r2.finalDir,
                            blockedByArrowId: r2.blockedBy,
                        };
                        if (r1.outcome === 'blocked' || r2.outcome === 'blocked') {
                            return {
                                outcome: 'blocked',
                                steps,
                                finalDir: d1,
                                blockedBy: r1.outcome === 'blocked' ? r1.blockedBy : r2.blockedBy,
                                blockerCell: r1.outcome === 'blocked' ? r1.blockerCell : r2.blockerCell,
                                splitBranches: [branch1, branch2],
                            };
                        }
                        return {
                            outcome: 'clear',
                            steps,
                            finalDir: d1,
                            splitBranches: [branch1, branch2],
                        };
                    }
                }
            }

            return { outcome: 'blocked', steps, finalDir: dir };
        };

        const traced = traceRay(startCell, startDir, startCell, 0);
        const reverseUpdates: Array<{ cellId: string; nextDir: DirName }> = [];
        localReverse.forEach((nextDir, cellId) => {
            const cur = this.gimmicks.get(cellId)?.currentReverseDir;
            if (cur !== nextDir) reverseUpdates.push({ cellId, nextDir });
        });

        return {
            arrowId,
            outcome: traced.outcome,
            useTail,
            steps: traced.steps,
            finalDir: traced.finalDir,
            blockedByArrowId: traced.blockedBy,
            blockerCellId: traced.blockerCell,
            splitBranches: traced.splitBranches,
            reverseUpdates,
        };
    }

    /**
     * Resolve whether a tap near tappedCellIndex on a double arrow launches from tail.
     */
    isTailSideTap(arrow: ArrowRuntime, tappedCellIndex: number): boolean {
        if (!arrow.isDouble || arrow.cells.length < 2) return false;
        const distHead = tappedCellIndex;
        const distTail = arrow.cells.length - 1 - tappedCellIndex;
        return distTail < distHead;
    }

    private computePausedCells(originalCells: string[], result: TraceResult): string[] {
        const base = result.useTail ? originalCells.slice().reverse() : originalCells.slice();
        const pathCells = result.steps.map((s) => s.cellId);
        // After sliding forward along pathCells, new head = last path cell, followed backwards through path then body
        const revPath = pathCells.slice().reverse();
        const combined = revPath.concat(base);
        return combined.slice(0, base.length);
    }

    /**
     * Execute player tap on an arrow cell, including double-arrow launch end selection
     * and linked branch group simultaneous firing / settle conflict detection.
     */
    tryTapArrow(arrowId: number, tappedCellIndex = 0): TapResolution {
        const tapped = this.arrows[arrowId];
        if (!tapped || tapped.removed) {
            return {
                accepted: false,
                outcome: 'ignored',
                firedArrowIds: [],
                pausedArrowIds: [],
                bouncedArrowIds: [],
                traces: [],
                levelCleared: this.isCleared,
            };
        }

        const groupIds = tapped.linkGroup > 0
            ? (this.linkGroups.get(tapped.linkGroup) ?? [arrowId]).filter((id) => !this.arrows[id].removed)
            : [arrowId];

        const depCells = new Set<string>();
        if (groupIds.length > 1) {
            for (const id of groupIds) {
                for (const c of this.arrows[id].cells) depCells.add(c);
            }
        }

        const reverseOverrides = new Map<string, DirName>();
        this.gimmicks.forEach((g) => {
            if (g.type === 'reverse_changer' && g.currentReverseDir) {
                reverseOverrides.set(g.cellId, g.currentReverseDir);
            }
        });

        const traces: TraceResult[] = [];
        for (const id of groupIds) {
            const a = this.arrows[id];
            const useTail = id === arrowId ? this.isTailSideTap(a, tappedCellIndex) : false;
            const tr = this.traceArrow(id, useTail, depCells, reverseOverrides);
            traces.push(tr);
            for (const u of tr.reverseUpdates) {
                reverseOverrides.set(u.cellId, u.nextDir);
            }
        }

        const anyBlocked = traces.some((t) => t.outcome === 'blocked');
        let settleConflict = false;
        if (!anyBlocked && groupIds.length > 1) {
            // Check settle overlap if multiple arrows pause or settle onto overlapping cells
            const settled = new Set<string>();
            for (const t of traces) {
                if (t.outcome === 'pause') {
                    const nextCells = this.computePausedCells(this.arrows[t.arrowId].cells, t);
                    for (const cid of nextCells) {
                        if (settled.has(cid)) {
                            settleConflict = true;
                            break;
                        }
                        settled.add(cid);
                    }
                }
                if (settleConflict) break;
            }
        }

        if (anyBlocked || settleConflict) {
            this.mistakesTaken++;
            const firstBlocked = traces.find((t) => t.outcome === 'blocked');
            return {
                accepted: true,
                outcome: 'blocked',
                firedArrowIds: [],
                pausedArrowIds: [],
                bouncedArrowIds: groupIds,
                traces,
                blockerCellId: firstBlocked?.blockerCellId,
                levelCleared: false,
            };
        }

        this.movesTaken++;
        const firedArrowIds: number[] = [];
        const pausedArrowIds: number[] = [];

        for (const tr of traces) {
            const a = this.arrows[tr.arrowId];
            if (tr.outcome === 'clear') {
                a.removed = true;
                firedArrowIds.push(a.id);
            } else if (tr.outcome === 'pause') {
                a.cells = this.computePausedCells(a.cells, tr);
                a.fireDir = tr.finalDir;
                pausedArrowIds.push(a.id);
            }
            for (const u of tr.reverseUpdates) {
                const g = this.gimmicks.get(u.cellId);
                if (g) g.currentReverseDir = u.nextDir;
            }
        }

        this.rebuildOccupancy();

        return {
            accepted: true,
            outcome: pausedArrowIds.length > 0 && firedArrowIds.length === 0 ? 'pause' : 'clear',
            firedArrowIds,
            pausedArrowIds,
            bouncedArrowIds: [],
            traces,
            levelCleared: this.isCleared,
        };
    }

    /** Booster action: forcibly clear a tapped arrow (or its linked group) cleanly. */
    smashArrow(arrowId: number): number[] {
        const target = this.arrows[arrowId];
        if (!target || target.removed) return [];
        const groupIds = target.linkGroup > 0
            ? (this.linkGroups.get(target.linkGroup) ?? [arrowId]).filter((id) => !this.arrows[id].removed)
            : [arrowId];
        for (const id of groupIds) {
            this.arrows[id].removed = true;
        }
        this.movesTaken++;
        this.rebuildOccupancy();
        return groupIds;
    }

    /** Read-only legal endpoints, also used to point hints at the usable head. */
    collectLegalMoves(): Array<{ arrowId: number; tappedCellIndex: number; prio: number }> {
        const reverseSnap = new Map<string, DirName>();
        this.gimmicks.forEach((g) => {
            if (g.type === 'reverse_changer' && g.currentReverseDir) {
                reverseSnap.set(g.cellId, g.currentReverseDir);
            }
        });

        const moves: Array<{ arrowId: number; tappedCellIndex: number; prio: number }> = [];
        const seenGroups = new Set<number>();

        for (let i = 0; i < this.arrows.length; i++) {
            const a = this.arrows[i];
            if (a.removed) continue;
            if (a.linkGroup > 0) {
                if (seenGroups.has(a.linkGroup)) continue;
                seenGroups.add(a.linkGroup);
            }
            const groupIds = a.linkGroup > 0
                ? (this.linkGroups.get(a.linkGroup) ?? [i]).filter((gid) => !this.arrows[gid].removed)
                : [i];
            const depCells = new Set<string>();
            if (groupIds.length > 1) {
                for (const gid of groupIds) {
                    for (const c of this.arrows[gid].cells) depCells.add(c);
                }
            }

            const endModes = a.isDouble && groupIds.length === 1 ? [0, a.cells.length - 1] : [0];
            for (const cellIdx of endModes) {
                const tr = this.traceArrow(i, cellIdx > 0, depCells, reverseSnap);
                if (tr.outcome === 'blocked') continue;
                let anyPause = tr.outcome === 'pause';
                let anyRev = tr.reverseUpdates.length > 0;
                let groupOk = true;
                if (groupIds.length > 1) {
                    const localRev = new Map(reverseSnap);
                    for (const u of tr.reverseUpdates) localRev.set(u.cellId, u.nextDir);
                    for (const gid of groupIds) {
                        if (gid === i) continue;
                        const gtr = this.traceArrow(gid, false, depCells, localRev);
                        if (gtr.outcome === 'blocked') {
                            groupOk = false;
                            break;
                        }
                        if (gtr.outcome === 'pause') anyPause = true;
                        if (gtr.reverseUpdates.length > 0) anyRev = true;
                    }
                }
                if (!groupOk) continue;
                // 0: pure clear, 1: clear flipping reverse_changer, 2/3: pause move
                const prio = anyPause ? (anyRev ? 3 : 2) : (anyRev ? 1 : 0);
                moves.push({ arrowId: i, tappedCellIndex: cellIdx, prio });
            }
        }

        moves.sort((a, b) => a.prio - b.prio);
        return moves;
    }

    /**
     * Collect all unique arrow IDs that can currently fire cleanly (for original Hint multi-highlight)
     * plus the best priority move list. Linked branch groups include every non-removed group member.
     */
    collectFireableArrowIds(): number[] {
        if (this.isCleared) return [];
        const legal = this.collectLegalMoves();
        const ids: number[] = [];
        const seen = new Set<number>();
        for (const m of legal) {
            const arrow = this.arrows[m.arrowId];
            if (!arrow || arrow.removed) continue;
            if (arrow.linkGroup > 0) {
                const groupIds = this.linkGroups.get(arrow.linkGroup) ?? [arrow.id];
                for (const gid of groupIds) {
                    if (!this.arrows[gid].removed && !seen.has(gid)) {
                        seen.add(gid);
                        ids.push(gid);
                    }
                }
            } else if (!seen.has(arrow.id)) {
                seen.add(arrow.id);
                ids.push(arrow.id);
            }
        }
        return ids;
    }

    /**
     * Find a guaranteed non-deadlocked valid move on the current board using a solver search.
     * Prioritizes immediate clears, and searches past reverse_changer / pause / double choices if needed.
     */
    findHint(maxSearchNodes = 600): { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null {
        if (this.isCleared) return null;

        const legalMoves = this.collectLegalMoves();
        if (legalMoves.length === 0) return null;

        // If a pure non-gimmick clear exists, it cannot invalidate solvability of remaining static board -> immediate win hint!
        if (legalMoves[0].prio === 0) {
            return {
                arrowId: legalMoves[0].arrowId,
                tappedCellIndex: legalMoves[0].tappedCellIndex,
                isPauseStep: false,
            };
        }

        // Otherwise run greedy-collapsed BFS to pick a winning branch across reverse_changer / pause choices!
        const firstMove = this.searchWinningFirstMove(maxSearchNodes);
        if (firstMove) return firstMove;
        const first = legalMoves[0];
        return { arrowId: first.arrowId, tappedCellIndex: first.tappedCellIndex, isPauseStep: first.prio >= 2 };
    }

    private searchWinningFirstMove(maxNodes: number): { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null {
        const snapshotState = () => ({
            removed: this.arrows.map((a) => a.removed),
            cells: this.arrows.map((a) => a.cells.slice()),
            dirs: this.arrows.map((a) => a.fireDir),
            rev: Array.from(this.gimmicks.entries())
                .filter(([, g]) => g.type === 'reverse_changer')
                .map(([k, g]) => [k, g.currentReverseDir!] as const),
        });
        type Snap = ReturnType<typeof snapshotState>;

        const restoreState = (snap: Snap) => {
            for (let i = 0; i < this.arrows.length; i++) {
                this.arrows[i].removed = snap.removed[i];
                this.arrows[i].cells = snap.cells[i].slice();
                this.arrows[i].fireDir = snap.dirs[i];
            }
            for (const [k, d] of snap.rev) {
                const g = this.gimmicks.get(k);
                if (g) g.currentReverseDir = d;
            }
            this.rebuildOccupancy();
        };

        const computeKey = () => {
            const revKey = Array.from(this.gimmicks.values())
                .filter((g) => g.type === 'reverse_changer')
                .map((g) => `${g.cellId}=${g.currentReverseDir}`)
                .join(';');
            const arrowKey = this.arrows
                .map((a) => (a.removed ? '1' : `${a.cells[0]},${a.cells[a.cells.length - 1]}@${a.fireDir}`))
                .join('|');
            return `${arrowKey}#${revKey}`;
        };

        const rootSnap = snapshotState();
        const savedMoves = this.movesTaken;
        const savedMistakes = this.mistakesTaken;
        const visited = new Set<string>();

        const collapseSafeClears = (
            firstMove: { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null,
        ): { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null => {
            let safety = 0;
            while (!this.isCleared && safety < this.arrows.length) {
                const moves = this.collectLegalMoves();
                if (moves.length === 0 || moves[0].prio !== 0) break;
                const res = this.tryTapArrow(moves[0].arrowId, moves[0].tappedCellIndex);
                if (!res.accepted || res.outcome === 'blocked') break;
                if (!firstMove) {
                    firstMove = {
                        arrowId: moves[0].arrowId,
                        tappedCellIndex: moves[0].tappedCellIndex,
                        isPauseStep: false,
                    };
                }
                safety++;
            }
            return firstMove;
        };

        // Best-first search prioritizing lowest remaining arrow count, then fewer branch steps
        const frontier: Array<{
            snap: Snap;
            rem: number;
            depth: number;
            firstMove: { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null;
        }> = [{ snap: rootSnap, rem: this.remainingCount, depth: 0, firstMove: null }];

        let chosen: { arrowId: number; tappedCellIndex: number; isPauseStep: boolean } | null = null;

        while (frontier.length > 0 && visited.size < maxNodes) {
            // Pop state with minimum (rem, depth) so unlocking moves are explored first
            let bestIdx = 0;
            for (let i = 1; i < frontier.length; i++) {
                const a = frontier[i];
                const b = frontier[bestIdx];
                if (a.rem < b.rem || (a.rem === b.rem && a.depth < b.depth)) {
                    bestIdx = i;
                }
            }
            const item = frontier.splice(bestIdx, 1)[0];
            restoreState(item.snap);

            const resolvedFirst = collapseSafeClears(item.firstMove);
            if (this.isCleared) {
                chosen = resolvedFirst;
                break;
            }

            const key = computeKey();
            if (visited.has(key)) continue;
            visited.add(key);

            const branchSnap = snapshotState();
            const cands = this.collectLegalMoves();
            for (const cand of cands) {
                restoreState(branchSnap);
                const res = this.tryTapArrow(cand.arrowId, cand.tappedCellIndex);
                if (!res.accepted || res.outcome === 'blocked') continue;
                let firstMove = resolvedFirst ?? {
                    arrowId: cand.arrowId,
                    tappedCellIndex: cand.tappedCellIndex,
                    isPauseStep: res.outcome === 'pause',
                };
                firstMove = collapseSafeClears(firstMove);
                if (this.isCleared) {
                    chosen = firstMove;
                    frontier.length = 0;
                    break;
                }
                const nextKey = computeKey();
                if (!visited.has(nextKey)) {
                    frontier.push({
                        snap: snapshotState(),
                        rem: this.remainingCount,
                        depth: item.depth + 1,
                        firstMove,
                    });
                }
            }
        }

        restoreState(rootSnap);
        this.movesTaken = savedMoves;
        this.mistakesTaken = savedMistakes;
        return chosen;
    }
}
