import type { RingHint, RingLevel, RingPart, RingPin, RingPoint, RingPull, RingSnapshot } from './RotateRingsTypes';
import * as G from './RotateRingsGeometry';

// 仅吸收浮点/轮廓舍入误差，不能把可见边缘向内缩到环带中心。
const BLOCK_TOL = .002;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6;
/** 滑杆在棋盘中的拖动方向（度）：自身朝向加局部拖动轴。 */
export function pullAxisAngle(pull: RingPull): number { return pull.angle + pull.dragAxis; }

/** 无引擎依赖的关卡内核。所有状态归本局持有，关卡资源数据始终只读。 */
export class RotateRingsModel {
    readonly rings = new Map<string, RingPart>();
    readonly pulls = new Map<string, RingPull>();
    readonly angles = new Map<string, number>();
    readonly offsets = new Map<string, number>();
    readonly solved = new Set<number>();
    readonly removedRings = new Set<string>();
    readonly removedPulls = new Set<string>();
    readonly removedFixed = new Set<string>();
    readonly explodedBombs = new Set<number>();
    pullObstacle?: string;
    moves = 0;
    seconds = 0;
    private pullGeometry = new Map<string, { offset: number; poly: RingPoint[] }>();
    private fixedGeometry: { id: string; poly: RingPoint[] }[];
    private readonly poses = new Map<string, RingPart>();
    private readonly probePoses = new Map<string, RingPart>();
    private readonly pinGeometry = new WeakMap<RingPart, (RingPin & { shape: ReturnType<typeof G.pinShape> })[]>();
    private readonly hardGeometry = new WeakMap<RingPart, RingPoint[][]>();
    private readonly pinReach = new Map<string, number>();
    private readonly rotationReach = new Map<string, number>();
    private readonly incidentLinks = new Map<string, number[]>();
    private readonly pullGuides = new Map<string, Set<string>>();
    private gestureActive = false;
    private readonly pendingBombContacts = new Map<number, Set<string>>();
    private readonly movedPulls = new Set<string>();

    constructor(readonly level: RingLevel, snapshot?: RingSnapshot) {
        level.rings.forEach(r => { this.rings.set(r.id, r); this.angles.set(r.id, G.norm180(r.angle)); });
        level.rings.forEach(r => {
            this.pinReach.set(r.id, Math.max(0, ...r.pins.map(p => p.radius)));
            this.rotationReach.set(r.id, Math.max(r.outer, ...r.pins.map(p => p.radius + 1)));
            this.incidentLinks.set(r.id, []);
        });
        level.links.forEach((link, index) => {
            this.incidentLinks.get(link.sourceRingId)?.push(index);
            if (link.targetPartId !== link.sourceRingId) this.incidentLinks.get(link.targetPartId)?.push(index);
        });
        level.guides.forEach(guide => {
            const ids = this.pullGuides.get(guide.stickPartId) ?? new Set<string>();
            ids.add(guide.guidePartId); this.pullGuides.set(guide.stickPartId, ids);
        });
        level.pullObjects.forEach(p => { this.pulls.set(p.id, p); this.offsets.set(p.id, 0); });
        this.fixedGeometry = [];
        level.fixedObjects.forEach(f => f.polygons.forEach(p => this.fixedGeometry.push({ id: f.id, poly: G.polygonWorld(p, f.x, f.y, f.angle) })));
        if (snapshot) this.restore(snapshot);
    }

    get completed(): boolean {
        return this.removedRings.size === this.rings.size && this.removedPulls.size === this.pulls.size
            && this.level.bombs.every((_, index) => this.bombCleared(index));
    }
    /** 滑杆在棋盘中的拖动方向（度）。 */
    pullAxis(id: string): number { return pullAxisAngle(this.pulls.get(id)!); }
    get total(): number { return this.level.links.length + this.pulls.size + this.level.bombs.length; }
    get progress(): number { return this.solved.size + this.removedPulls.size
        + this.level.bombs.filter((_, index) => this.bombCleared(index)).length; }
    private removePart(id: string): void {
        if (this.rings.has(id)) this.removedRings.add(id);
        else if (this.pulls.has(id)) {
            this.removedPulls.add(id);
            this.level.guides.filter(g => g.stickPartId === id).forEach(g => this.removedFixed.add(g.guidePartId));
        }
        else this.removedFixed.add(id);
        this.level.links.forEach((link, i) => {
            if (link.sourceRingId === id || link.targetPartId === id) this.solved.add(i);
        });
    }

    bombCleared(index: number): boolean {
        const bomb = this.level.bombs[index];
        return this.explodedBombs.has(index) || !!bomb.ringId && this.removedRings.has(bomb.ringId)
            || !!bomb.pullId && this.removedPulls.has(bomb.pullId);
    }
    bombAngle(index: number): number {
        const bomb = this.level.bombs[index];
        return (bomb.visual?.angle ?? 0) + (bomb.ringId ? this.angles.get(bomb.ringId)! : bomb.pullId ? this.pulls.get(bomb.pullId)!.angle : 0);
    }
    bombPoint(index: number, visual = false): RingPoint {
        const bomb = this.level.bombs[index], local = visual && bomb.visual ? bomb.visual : bomb;
        if (bomb.ringId) {
            const host = this.pose(bomb.ringId); return G.polygonWorld([local], host.x, host.y, host.angle)[0];
        }
        if (bomb.pullId) {
            const host = this.pulls.get(bomb.pullId)!;
            return G.polygonWorld([local], host.x, host.y, host.angle, G.polar(this.offsets.get(host.id) || 0, host.dragAxis))[0];
        }
        return { x: local.x, y: local.y };
    }
    private bombHitsRing(id: string, center: RingPoint, radius: number): boolean {
        const pose = this.pose(id);
        return G.circleHitsRingBand(center, radius, pose)
            || this.pins(id).some(pin => pin.shape.prongs.some(claw => G.rectHitsCircle(claw, center.x, center.y, radius)))
            || this.hardBlocks(pose).some(poly => G.polygonHitsCircle(poly, center.x, center.y, radius));
    }

    /** 移动宿主时扫描所有外部实体；宿主静止时，仅当移动件触及炸弹才收集同一时刻的全部接触。 */
    private probeBombs(movedId: string): void {
        for (let i = 0; i < this.level.bombs.length; i++) {
            const bomb = this.level.bombs[i];
            if (this.bombCleared(i)) continue;
            const c = this.bombPoint(i), hostId = bomb.ringId || bomb.pullId;
            if (hostId !== movedId) {
                const touched = this.rings.has(movedId) ? this.bombHitsRing(movedId, c, bomb.radius)
                    : G.polygonHitsCircle(this.pullPolygon(movedId), c.x, c.y, bomb.radius);
                if (!touched) continue;
            }
            const targets = new Set<string>();
            for (const ring of this.level.rings) {
                if (ring.id !== hostId && !this.removedRings.has(ring.id)
                    && (ring.id === movedId || this.bombHitsRing(ring.id, c, bomb.radius))) targets.add(ring.id);
            }
            for (const pull of this.level.pullObjects) {
                if (pull.id !== hostId && !this.removedPulls.has(pull.id)
                    && (pull.id === movedId || G.polygonHitsCircle(this.pullPolygon(pull.id), c.x, c.y, bomb.radius))) targets.add(pull.id);
            }
            for (const fixed of this.fixedGeometry) if (!this.removedFixed.has(fixed.id)
                && G.polygonHitsCircle(fixed.poly, c.x, c.y, bomb.radius)) targets.add(fixed.id);
            if (!targets.size) continue;
            if (hostId) targets.add(hostId);
            const pending = this.pendingBombContacts.get(i) ?? new Set<string>();
            targets.forEach(id => pending.add(id)); this.pendingBombContacts.set(i, pending);
        }
    }

    private commitBombs(): void {
        this.pendingBombContacts.forEach((targets, index) => {
            if (this.bombCleared(index)) return;
            this.explodedBombs.add(index); targets.forEach(id => this.removePart(id));
        });
        this.pendingBombContacts.clear();
    }

    pose(id: string, angle = this.angles.get(id)): RingPart {
        // 候选角度不能顶掉真实姿态，否则轮流探测/碰撞抖动会让静止邻居反复重建轮廓。
        const actual = angle === this.angles.get(id), cache = actual ? this.poses : this.probePoses;
        const cached = cache.get(id); if (cached?.angle === angle) return cached;
        const other = (actual ? this.probePoses : this.poses).get(id);
        const pose = other?.angle === angle ? other : { ...this.rings.get(id)!, angle };
        cache.set(id, pose); return pose;
    }
    pins(id: string, angle?: number): (RingPin & { shape: ReturnType<typeof G.pinShape> })[] {
        const ring = this.pose(id, angle);
        const cached = this.pinGeometry.get(ring); if (cached) return cached;
        const pins = ring.pins.map(pin => ({ ...pin, shape: G.pinShape(ring, pin, pin.radius) }));
        this.pinGeometry.set(ring, pins); return pins;
    }
    private hardBlocks(ring: RingPart): RingPoint[][] {
        const cached = this.hardGeometry.get(ring); if (cached) return cached;
        const polygons = ring.hardBlocks.map(poly => G.polygonWorld(poly, ring.x, ring.y, ring.angle));
        this.hardGeometry.set(ring, polygons); return polygons;
    }
    pullPolygon(id: string, offset = this.offsets.get(id) || 0): RingPoint[] {
        const p = this.pulls.get(id)!;
        const cached = this.pullGeometry.get(id);
        if (cached?.offset === offset) return cached.poly;
        const poly = G.polygonWorld(p.polyLocal, p.x, p.y, p.angle, G.polar(offset, p.dragAxis));
        this.pullGeometry.set(id, { offset, poly }); return poly;
    }

    /** 按住期间只更新合法姿态、收集炸弹接触，不消除实体，也不锁住拖动。 */
    beginGesture(): void {
        if (this.gestureActive) return;
        this.pullObstacle = undefined;
        this.gestureActive = true; this.pendingBombContacts.clear(); this.movedPulls.clear();
    }

    /** 每次实际改变棋盘的拖动只计一步，不保存撤销历史。 */
    endGesture(changed: boolean): void {
        if (changed) {
            this.commitBombs();
            this.movedPulls.forEach(id => this.releasePull(id));
            this.evaluate(); this.moves++;
        }
        this.gestureActive = false; this.pendingBombContacts.clear(); this.movedPulls.clear();
    }

    blockReason(id: string, angle: number): string | undefined {
        if (this.removedRings.has(id)) return undefined;
        const self = this.pose(id, angle), pins = this.pins(id, angle), hard = this.hardBlocks(self);
        for (const other of this.level.rings) {
            if (other.id === id || this.removedRings.has(other.id)) continue;
            // 远离的环不参与昂贵的叉形碰撞探测。
            const reach = self.outer + other.outer + Math.max(this.pinReach.get(id)!, this.pinReach.get(other.id)!);
            if (Math.hypot(self.x - other.x, self.y - other.y) > reach + 2) continue;
            const target = this.pose(other.id), others = this.pins(other.id), otherHard = this.hardBlocks(target);
            if (G.ringBandsIntersect(self, target, BLOCK_TOL)) return other.id;
            for (const pin of pins) for (const prong of pin.shape.prongs) {
                // 爪与环带按画面上卡扣的边缘判定，避免在可见空隙处提前卡住（见 pinShape 的 slack）。
                if (G.rectHitsRingBand(prong, target, false, BLOCK_TOL + prong.slack)) return other.id;
                for (const op of others) for (const claw of op.shape.prongs) {
                    if (G.rectsIntersect(prong, claw)) return other.id;
                }
                if (otherHard.some(h => G.rectHitsPolygon(prong, h))) return other.id;
            }
            for (const op of others) for (const claw of op.shape.prongs) {
                if (G.rectHitsRingBand(claw, self, false, BLOCK_TOL + claw.slack) || hard.some(h => G.rectHitsPolygon(claw, h))) return other.id;
            }
            if (hard.some(h => G.polygonHitsRingBand(h, target, BLOCK_TOL))
                || otherHard.some(h => G.polygonHitsRingBand(h, self, BLOCK_TOL))
                || hard.some(h => otherHard.some(other => G.polygonsIntersect(h, other)))) return other.id;
        }
        for (const p of this.level.pullObjects) {
            if (this.removedPulls.has(p.id)) continue;
            const poly = this.pullPolygon(p.id);
            if (G.polygonHitsRingBand(poly, self, BLOCK_TOL)
                || pins.some(pin => pin.shape.prongs.some(claw => G.rectHitsPolygon(claw, poly)))
                || hard.some(h => G.polygonsIntersect(h, poly))) return p.id;
        }
        for (const fixed of this.fixedGeometry) {
            if (this.removedFixed.has(fixed.id)) continue;
            if (pins.some(pin => pin.shape.prongs.some(claw => G.rectHitsPolygon(claw, fixed.poly)))
                || hard.some(h => G.polygonsIntersect(h, fixed.poly))) return fixed.id;
        }
        return undefined;
    }

    rotateRing(id: string, target: number): { rotated: number; blocked: boolean } {
        if (!this.rings.has(id) || this.removedRings.has(id) || !finite(target)) return { rotated: 0, blocked: false };
        return this.rotateRingBy(id, G.angleDiff(target, this.angles.get(id)!));
    }

    rotateRingBy(id: string, sweep: number): { rotated: number; blocked: boolean } {
        if (!this.rings.has(id) || this.removedRings.has(id) || !finite(sweep)) return { rotated: 0, blocked: false };
        let angle = this.angles.get(id)!, remaining = sweep, rotated = 0;
        const reach = this.rotationReach.get(id)!;
        const step = Math.min(.5, .025 / reach / G.DEG, Math.abs(remaining));
        for (let i = 0; i < 1440 && Math.abs(remaining) > 1e-6; i++) {
            const delta = Math.sign(remaining) * Math.min(step, Math.abs(remaining));
            if (this.blockReason(id, angle + delta)) { this.angles.set(id, G.norm180(angle)); return { rotated, blocked: true }; }
            angle += delta; this.angles.set(id, G.norm180(angle)); rotated += Math.abs(delta);
            this.probeBombs(id);
            remaining -= delta;
        }
        return { rotated, blocked: false };
    }

    private pullBlocker(id: string, poly: RingPoint[]): string | undefined {
        for (const ring of this.level.rings) {
            if (this.removedRings.has(ring.id)) continue;
            if (G.polygonHitsRingBand(poly, this.pose(ring.id), BLOCK_TOL)
                || this.pins(ring.id).some(pin => pin.shape.prongs.some(claw => G.rectHitsPolygon(claw, poly)))
                || this.hardBlocks(this.pose(ring.id)).some(hard => G.polygonsIntersect(hard, poly))) return ring.id;
        }
        for (const other of this.level.pullObjects) {
            if (other.id !== id && !this.removedPulls.has(other.id) && G.polygonsIntersect(poly, this.pullPolygon(other.id))) return other.id;
        }
        // 该滑杆的导轨允许沿轨道穿行，其他导轨仍然是实体阻挡。
        const guides = this.pullGuides.get(id);
        for (const fixed of this.fixedGeometry) {
            if (this.removedFixed.has(fixed.id)) continue;
            if (guides?.has(fixed.id)) continue;
            if (G.polygonsIntersect(poly, fixed.poly)) return fixed.id;
        }
        return undefined;
    }

    dragPull(id: string, delta: number): { moved: number; blocked: boolean } {
        const p = this.pulls.get(id);
        if (!p || this.removedPulls.has(id) || !finite(delta) || Math.abs(delta) < .005) return { moved: 0, blocked: false };
        const before = this.offsets.get(id)!;
        const goal = before + delta;
        this.pullObstacle = undefined;
        let current = before;
        for (let i = 0; i < 160 && Math.abs(goal - current) > 1e-5; i++) {
            const next = current + Math.sign(delta) * Math.min(.08, Math.abs(goal - current));
            const blocker = this.pullBlocker(id, this.pullPolygon(id, next));
            if (blocker) {
                this.pullObstacle = blocker;
                this.offsets.set(id, current); return { moved: current - before, blocked: true };
            }
            current = next; this.offsets.set(id, current); this.movedPulls.add(id); this.probeBombs(id);
        }
        return { moved: current - before, blocked: false };
    }

    private releasePull(id: string): void {
        const current = this.offsets.get(id)!;
        if (this.removedPulls.has(id) || Math.abs(current) <= this.pulls.get(id)!.moveThreshold) return;
        const sign = Math.sign(current), axis = G.polar(sign, this.pullAxis(id));
        const poly = this.pullPolygon(id), distance = this.pullExitDistance(id, poly, axis);
        if (!this.level.bombs.length) {
            // Every swept point enters through the moving outline. Extruding the edges also preserves concave grips.
            const end = poly.map(p => ({ x: p.x + axis.x * distance, y: p.y + axis.y * distance }));
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                if (Math.abs((poly[i].x - poly[j].x) * axis.y - (poly[i].y - poly[j].y) * axis.x) < 1e-8) continue;
                const blocker = this.pullBlocker(id, [poly[j], poly[i], end[i], end[j]]);
                if (blocker) { this.pullObstacle = blocker; return; }
            }
            this.removePart(id);
            return;
        }
        // 松手才探测完整出口；沿途先处理实际炸弹接触，再检查剩余实体是否挡路。
        // 探测失败时不提交，成功时保留最后可见位置，供消除碎片取样。
        const snapshot = this.snapshot(), probe = new RotateRingsModel(this.level, snapshot);
        for (let step = .08; step <= distance; step += .08) {
            probe.offsets.set(id, current + sign * step); probe.probeBombs(id); probe.commitBombs();
            if (probe.removedPulls.has(id)) break;
            const blocker = probe.pullBlocker(id, probe.pullPolygon(id, current + sign * step));
            if (blocker) { this.pullObstacle = blocker; return; }
        }
        probe.removePart(id);
        this.restore({ ...probe.snapshot(), offsets: snapshot.offsets });
    }
    private pullExitDistance(id: string, poly: RingPoint[], axis: RingPoint): number {
        const project = (p: RingPoint) => p.x * axis.x + p.y * axis.y;
        const trailing = Math.min(...poly.map(project));
        let far = trailing;
        for (const ring of this.level.rings) {
            if (!this.removedRings.has(ring.id)) {
                far = Math.max(far, project(ring) + this.rotationReach.get(ring.id)!);
                for (const block of this.hardBlocks(this.pose(ring.id))) for (const p of block) far = Math.max(far, project(p));
            }
        }
        for (const bar of this.level.pullObjects) {
            if (bar.id !== id && !this.removedPulls.has(bar.id))
                for (const p of this.pullPolygon(bar.id)) far = Math.max(far, project(p));
        }
        for (const fixed of this.fixedGeometry) if (!this.removedFixed.has(fixed.id))
            for (const p of fixed.poly) far = Math.max(far, project(p));
        this.level.bombs.forEach((bomb, i) => {
            if (!this.bombCleared(i)) far = Math.max(far, project(this.bombPoint(i)) + bomb.radius);
        });
        return far - trailing + .16;
    }
    evaluate(): void {
        this.solved.clear();
        for (let i = 0; i < this.level.links.length; i++) {
            const link = this.level.links[i];
            if (this.removedRings.has(link.sourceRingId) || this.removedRings.has(link.targetPartId)
                || this.removedPulls.has(link.targetPartId)) { this.solved.add(i); continue; }
            const pin = this.pins(link.sourceRingId).find(p => p.featureId === link.pinFeatureId);
            if (!pin) continue;
            if (this.rings.has(link.targetPartId)) {
                if (G.pinThroughRing(pin, this.pose(link.targetPartId))) this.solved.add(i);
            } else if (this.pulls.has(link.targetPartId)) {
                if (this.removedPulls.has(link.targetPartId) || !G.rectHitsPolygon(pin.shape.mouth, this.pullPolygon(link.targetPartId))) this.solved.add(i);
            }
        }
        // 所有当前套接同时解除才可离开；还要检查旋转后新叉住的非初始邻居。
        let released: boolean;
        do {
            released = false;
            for (const ring of this.level.rings) {
                if (this.removedRings.has(ring.id)) continue;
                const incident = this.incidentLinks.get(ring.id)!;
                if (incident.length && incident.every(i => this.solved.has(i)) && !this.hasInterlock(ring.id)) {
                    this.removePart(ring.id); released = true;
                }
            }
        } while (released);
    }

    private hasInterlock(id: string): boolean {
        const self = this.pose(id), pins = this.pins(id);
        for (const other of this.level.rings) {
            if (other.id === id || this.removedRings.has(other.id)) continue;
            const target = this.pose(other.id);
            if (pins.some(pin => !G.pinThroughRing(pin, target))
                || this.pins(other.id).some(pin => !G.pinThroughRing(pin, self))) return true;
        }
        return this.level.pullObjects.some(pull => !this.removedPulls.has(pull.id)
            && pins.some(pin => G.rectHitsPolygon(pin.shape.mouth, this.pullPolygon(pull.id))));
    }

    /** 在副本上模拟完整手势和松手结算，并记录手指实际能走的有向角度。 */
    private previewHint(candidate: RingHint, snapshot: RingSnapshot): { hint: RingHint; next: RotateRingsModel } | undefined {
        const next = new RotateRingsModel(this.level, snapshot);
        next.beginGesture();
        if (candidate.kind === 'ring') {
            const start = this.angles.get(candidate.id)!;
            const sweep = candidate.sweep ?? G.angleDiff(candidate.target, start);
            const { rotated } = next.rotateRingBy(candidate.id, sweep);
            if (rotated < .01) return undefined;
            candidate = { ...candidate, target: next.angles.get(candidate.id)!, sweep: Math.sign(sweep) * rotated };
        } else {
            const { moved } = next.dragPull(candidate.id, candidate.target);
            if (Math.abs(moved) < .005) return undefined;
            candidate = { ...candidate, target: moved };
        }
        next.endGesture(true);
        return { hint: candidate, next };
    }

    private advances(next: RotateRingsModel): boolean {
        return next.progress > this.progress || next.removedRings.size > this.removedRings.size
            || next.removedPulls.size > this.removedPulls.size;
    }

    /** 同一缺口有多个卡扣可对准时，先放走已经可以脱开的邻环。 */
    private preferRingRelease(ring: RingPart, first: { hint: RingHint; next: RotateRingsModel }, snapshot: RingSnapshot): RingHint {
        if (first.next.removedRings.size > this.removedRings.size) return first.hint;
        let best = first;
        const start = this.angles.get(ring.id)!;
        for (const index of this.incidentLinks.get(ring.id)!) {
            const link = this.level.links[index];
            if (link.targetPartId !== ring.id || this.removedRings.has(link.sourceRingId)) continue;
            const pin = this.pins(link.sourceRingId).find(p => p.featureId === link.pinFeatureId);
            if (!pin) continue;
            const target = G.angleTo(ring, pin.shape.center) - ring.gapDir;
            const shortest = G.angleDiff(target, start);
            if (!this.level.bombs.length && Math.abs(G.angleDiff(target, first.hint.target)) < .01) continue;
            for (const sweep of [shortest, shortest - Math.sign(shortest) * 360]) {
                if (Math.abs(sweep) < .01 || Math.abs(sweep - first.hint.sweep!) < .01) continue;
                const probe = this.previewHint({ kind: 'ring', id: ring.id, target, sweep }, snapshot);
                if (probe && probe.next.removedRings.size > best.next.removedRings.size) best = probe;
                // A full turn to the same endpoint has identical contact geometry.
                if (probe && !this.level.bombs.length && Math.abs(G.angleDiff(target, probe.hint.target)) < .01) break;
            }
        }
        return best.hint;
    }

    hint(): RingHint | undefined {
        const direct = this.releaseHint();
        if (direct) return direct;
        // A parked slider or a twisted clasp can block the exit even when its guard is gone.
        // Offer a repositioning gesture only after verifying a follow-up on that exact pose.
        const snapshot = this.snapshot();
        const prepare = (candidate: RingHint) => {
            const setup = this.previewHint(candidate, snapshot);
            if (!setup) return undefined;
            if (this.advances(setup.next)) return setup.hint;
            let next = setup.next;
            // A follow-up can itself be a clasp alignment. Compare the final release with the
            // original board so that re-locking and re-opening the same link never qualifies.
            for (let i = 0; i < 2; i++) {
                const follow = next.releaseHint();
                if (!follow) break;
                const result = next.previewHint(follow, next.snapshot());
                if (!result) break;
                if (this.advances(result.next)) return { ...setup.hint, prepareNext: true };
                next = result.next;
            }
            return undefined;
        };
        for (const p of this.level.pullObjects) {
            if (this.removedPulls.has(p.id) || Math.abs(this.offsets.get(p.id)!) < .005) continue;
            const hint = prepare({ kind: 'pull', id: p.id, target: -this.offsets.get(p.id)! });
            if (hint) return hint;
        }
        for (const r of this.level.rings) {
            if (this.removedRings.has(r.id)) continue;
            const sweep = G.angleDiff(r.angle, this.angles.get(r.id)!);
            if (Math.abs(sweep) < .01) continue;
            const hint = prepare({ kind: 'ring', id: r.id, target: r.angle, sweep });
            if (hint) return hint;
        }
        return undefined;
    }

    private releaseHint(): RingHint | undefined {
        const snapshot = this.snapshot();
        const advancing = (candidate: RingHint) => {
            const result = this.previewHint(candidate, snapshot);
            return result && this.advances(result.next) ? result.hint : undefined;
        };
        for (const p of this.level.pullObjects) {
            if (this.removedPulls.has(p.id)) continue;
            for (const sign of [1, -1]) {
                // The target is an offset from the mount. A parked bar may have to cross the mount to exit.
                const offset = this.offsets.get(p.id)!;
                const hint = advancing({ kind: 'pull', id: p.id, target: sign * 1.2 - (sign * offset < 0 ? offset : 0) });
                if (hint) return hint;
            }
        }
        // 转动卡扣可能叉住其他邻环，按眼前的套接关系寻找可动部件。
        const locks: { source: RingPart; target: RingPart; pin: RingPin; toward: number }[] = [];
        const live = this.level.rings.filter(r => !this.removedRings.has(r.id));
        for (const target of live.slice().reverse()) for (const source of live) {
            if (source === target) continue;
            for (const pin of this.pins(source.id)) {
                if (G.pinThroughRing(pin, this.pose(target.id))) continue;
                locks.push({ source, target, pin, toward: G.angleTo(target, pin.shape.center) - target.gapDir });
            }
        }
        for (const longWay of [false, true]) {
            for (const { target, toward } of locks) {
                if (target.gapWidth <= 0) continue;
                const shortest = G.angleDiff(toward, this.angles.get(target.id)!);
                const sweep = longWay ? shortest - Math.sign(shortest) * 360 : shortest;
                const probe = this.previewHint({ kind: 'ring', id: target.id, target: toward, sweep }, snapshot);
                if (probe && this.advances(probe.next)) return this.preferRingRelease(target, probe, snapshot);
            }
        }
        // 对准来环的缺口后，自身的另一只卡扣仍可能叉住滑杆。在开口范围内继续转动，直到整个环都能脱离。
        for (const ring of live) {
            if (!ring.pins.length || ring.gapWidth <= 0
                || !this.incidentLinks.get(ring.id)!.every(index => this.solved.has(index))) continue;
            const gripsSlider = this.level.pullObjects.some(p => !this.removedPulls.has(p.id)
                && this.pins(ring.id).some(pin => G.rectHitsPolygon(pin.shape.mouth, this.pullPolygon(p.id))));
            if (!gripsSlider) continue;
            const angle = this.angles.get(ring.id)!;
            for (let step = 1; step <= 12; step++) {
                for (const sign of [1, -1]) {
                    const sweep = sign * step * ring.gapWidth / 12;
                    const result = this.previewHint({ kind: 'ring', id: ring.id, target: angle + sweep, sweep }, snapshot);
                    if (result?.next.removedRings.has(ring.id)) return result.hint;
                }
            }
        }
        // 偏斜的卡扣可能挡住两个转向。先尝试摆正或让出半个叉口，再验证邻环确实能脱开。
        for (const side of [0, -1, 1]) for (const { source, target, pin } of locks) {
            const halfMouth = Math.atan2(pin.mouthSize.y / 2, pin.radius) / G.DEG;
            const angle = G.angleTo(source, target) - pin.angleDeg + side * halfMouth;
            const setup = this.previewHint({ kind: 'ring', id: source.id, target: angle }, snapshot);
            if (!setup) continue;
            if (this.advances(setup.next)) return setup.hint;
            if (target.gapWidth <= 0) continue;
            const centered = setup.next.pins(source.id).find(p => p.featureId === pin.featureId)!;
            const toward = G.angleTo(target, centered.shape.center) - target.gapDir;
            const shortest = G.angleDiff(toward, setup.next.angles.get(target.id)!);
            const aligned = setup.next.snapshot();
            for (const sweep of [shortest, shortest - Math.sign(shortest) * 360]) {
                const follow = setup.next.previewHint({ kind: 'ring', id: target.id, target: toward, sweep }, aligned);
                if (follow && this.advances(follow.next)) return { ...setup.hint, prepareNext: true };
            }
        }
        // 独立炸弹也可能是棋盘上最后的目标，保留能实际触发爆炸的转动提示。
        for (let i = 0; i < this.level.bombs.length; i++) {
            if (this.bombCleared(i)) continue;
            const host = this.level.bombs[i].ringId;
            for (const ring of live) {
                if (host && host !== ring.id) continue;
                for (const sweep of [-45, 45]) {
                    const hint = advancing({ kind: 'ring', id: ring.id, target: this.angles.get(ring.id)! + sweep, sweep });
                    if (hint) return hint;
                }
            }
        }
        return undefined;
    }

    snapshot(): RingSnapshot {
        const angles: Record<string, number> = {}, offsets: Record<string, number> = {};
        this.angles.forEach((v, k) => { angles[k] = v; }); this.offsets.forEach((v, k) => { offsets[k] = v; });
        return { levelId: this.level.id, angles, offsets, solved: Array.from(this.solved),
            removedRings: Array.from(this.removedRings), removedPulls: Array.from(this.removedPulls), moves: this.moves, seconds: this.seconds,
            explodedBombs: Array.from(this.explodedBombs), removedFixed: Array.from(this.removedFixed), pullAxes: 1 };
    }
    private restore(s: RingSnapshot): boolean {
        if (!s || s.levelId !== this.level.id || !s.angles || !s.offsets || !Array.isArray(s.solved)
            || !Array.isArray(s.removedRings) || !Array.isArray(s.removedPulls)
            || !finite(s.moves) || s.moves < 0 || !finite(s.seconds) || s.seconds < 0
            || this.level.rings.some(r => !finite(s.angles[r.id])) || this.level.pullObjects.some(p => !finite(s.offsets[p.id]))
            || s.solved.some(i => !Number.isInteger(i) || i < 0 || i >= this.level.links.length)
            || s.removedRings.some(id => !this.rings.has(id)) || s.removedPulls.some(id => !this.pulls.has(id))) return false;
        if (s.explodedBombs !== undefined && (!Array.isArray(s.explodedBombs)
            || s.explodedBombs.some(i => !Number.isInteger(i) || i < 0 || i >= this.level.bombs.length
                || !!this.level.bombs[i].ringId && s.removedRings.indexOf(this.level.bombs[i].ringId!) < 0
                || !!this.level.bombs[i].pullId && s.removedPulls.indexOf(this.level.bombs[i].pullId!) < 0))) return false;
        // 旧存档把局部 Y 轴滑杆的偏移当作局部 X 记录，含这类偏移时无法换算，放弃续玩从头开始。
        if (s.pullAxes !== 1 && this.level.pullObjects.some(p => p.dragAxis !== 0 && Math.abs(s.offsets[p.id]) > 1e-6)) return false;
        if (s.removedFixed !== undefined && (!Array.isArray(s.removedFixed)
            || s.removedFixed.some(id => !this.level.fixedObjects.some(f => f.id === id)))) return false;
        const solved = new Set(s.solved);
        if (s.removedRings.some(id => this.level.links.some((l, i) =>
            (l.sourceRingId === id || l.targetPartId === id) && !solved.has(i)))) return false;
        this.level.rings.forEach(r => this.angles.set(r.id, G.norm180(s.angles[r.id])));
        this.level.pullObjects.forEach(p => this.offsets.set(p.id, s.offsets[p.id]));
        this.solved.clear(); s.solved.forEach(i => this.solved.add(i));
        this.removedRings.clear(); s.removedRings.forEach(id => this.removedRings.add(id));
        this.removedPulls.clear(); s.removedPulls.forEach(id => this.removedPulls.add(id));
        this.explodedBombs.clear(); s.explodedBombs?.forEach(i => this.explodedBombs.add(i));
        this.removedFixed.clear(); s.removedFixed?.forEach(id => this.removedFixed.add(id));
        this.level.guides.filter(g => this.removedPulls.has(g.stickPartId)).forEach(g => this.removedFixed.add(g.guidePartId));
        this.moves = Math.floor(s.moves); this.seconds = s.seconds;
        return true;
    }
}
