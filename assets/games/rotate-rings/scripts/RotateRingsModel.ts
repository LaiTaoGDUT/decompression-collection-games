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
    moves = 0;
    seconds = 0;
    private pullGeometry = new Map<string, { offset: number; poly: RingPoint[] }>();
    private fixedGeometry: { id: string; poly: RingPoint[] }[];
    private readonly poses = new Map<string, RingPart>();
    private gestureActive = false;
    private readonly pendingBombContacts = new Map<number, Set<string>>();
    private readonly movedPulls = new Set<string>();

    constructor(readonly level: RingLevel, snapshot?: RingSnapshot) {
        level.rings.forEach(r => { this.rings.set(r.id, r); this.angles.set(r.id, G.norm180(r.angle)); });
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
    /** 原 BombRelative：只响应外部实体接触，忽略自身宿主及销的触发口；消除宿主和接触部件。 */
    private probeBombs(movedId: string): void {
        for (let i = 0; i < this.level.bombs.length; i++) {
            const bomb = this.level.bombs[i];
            if (this.bombCleared(i)) continue;
            const c = this.bombPoint(i), targets = new Set<string>();
            for (const ring of this.level.rings) {
                if (ring.id === bomb.ringId || this.removedRings.has(ring.id)) continue;
                if (G.circleHitsRingBand(c, bomb.radius, this.pose(ring.id))
                    || this.pins(ring.id).some(p => p.shape.prongs.some(r => G.rectHitsCircle(r, c.x, c.y, bomb.radius)))
                    || this.hardBlocks(this.pose(ring.id)).some(p => G.polygonHitsCircle(p, c.x, c.y, bomb.radius))) targets.add(ring.id);
            }
            for (const pull of this.level.pullObjects) if (pull.id !== bomb.pullId && !this.removedPulls.has(pull.id)
                && G.polygonHitsCircle(this.pullPolygon(pull.id), c.x, c.y, bomb.radius)) targets.add(pull.id);
            for (const fixed of this.fixedGeometry) if (!this.removedFixed.has(fixed.id)
                && G.polygonHitsCircle(fixed.poly, c.x, c.y, bomb.radius)) targets.add(fixed.id);
            // 静止宿主的旧接触不由无关拖动触发；移动宿主时扫描全部当前接触。
            const hostId = bomb.ringId || bomb.pullId;
            if (!targets.size || hostId !== movedId && !targets.has(movedId)) continue;
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
        const cached = this.poses.get(id); if (cached?.angle === angle) return cached;
        const pose = { ...this.rings.get(id)!, angle }; this.poses.set(id, pose); return pose;
    }
    pins(id: string, angle?: number): (RingPin & { shape: ReturnType<typeof G.pinShape> })[] {
        const ring = this.pose(id, angle);
        return ring.pins.map(pin => ({ ...pin, shape: G.pinShape(ring, pin, pin.radius) }));
    }
    private hardBlocks(ring: RingPart): RingPoint[][] {
        return ring.hardBlocks.map(poly => G.polygonWorld(poly, ring.x, ring.y, ring.angle));
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
            const reach = self.outer + other.outer + Math.max(0, ...self.pins.map(p => p.radius), ...other.pins.map(p => p.radius));
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
        let angle = this.angles.get(id)!, remaining = G.angleDiff(target, angle), rotated = 0;
        const reach = Math.max(this.rings.get(id)!.outer, ...this.rings.get(id)!.pins.map(pin => pin.radius + 1));
        const step = Math.min(.5, .025 / reach / G.DEG, Math.abs(remaining));
        for (let i = 0; i < 1440 && Math.abs(remaining) > 1e-6; i++) {
            const delta = Math.sign(remaining) * Math.min(step, Math.abs(remaining));
            if (this.blockReason(id, angle + delta)) { this.angles.set(id, G.norm180(angle)); return { rotated, blocked: true }; }
            angle += delta; this.angles.set(id, G.norm180(angle)); rotated += Math.abs(delta);
            this.probeBombs(id);
            remaining = G.angleDiff(target, angle);
        }
        return { rotated, blocked: false };
    }

    private pullBlocked(id: string, offset: number): boolean {
        const poly = this.pullPolygon(id, offset);
        for (const ring of this.level.rings) {
            if (this.removedRings.has(ring.id)) continue;
            if (G.polygonHitsRingBand(poly, this.pose(ring.id), BLOCK_TOL)
                || this.pins(ring.id).some(pin => pin.shape.prongs.some(claw => G.rectHitsPolygon(claw, poly)))
                || this.hardBlocks(this.pose(ring.id)).some(hard => G.polygonsIntersect(hard, poly))) return true;
        }
        for (const other of this.level.pullObjects) {
            if (other.id !== id && !this.removedPulls.has(other.id) && G.polygonsIntersect(poly, this.pullPolygon(other.id))) return true;
        }
        // 该滑杆的导轨允许沿轨道穿行，其他导轨仍然是实体阻挡。
        const guides = this.level.guides.filter(g => g.stickPartId === id).map(g => g.guidePartId);
        for (const fixed of this.fixedGeometry) {
            if (this.removedFixed.has(fixed.id)) continue;
            if (guides.indexOf(fixed.id) >= 0) continue;
            if (G.polygonsIntersect(poly, fixed.poly)) return true;
        }
        return false;
    }

    dragPull(id: string, delta: number): { moved: number; blocked: boolean } {
        const p = this.pulls.get(id);
        if (!p || this.removedPulls.has(id) || !finite(delta) || Math.abs(delta) < .005) return { moved: 0, blocked: false };
        if ((delta < 0 && !p.negative) || (delta > 0 && !p.positive)) return { moved: 0, blocked: true };
        const before = this.offsets.get(id)!, goal = before + delta;
        let current = before;
        for (let i = 0; i < 160 && Math.abs(goal - current) > 1e-5; i++) {
            const next = current + Math.sign(delta) * Math.min(.08, Math.abs(goal - current));
            if (this.pullBlocked(id, next)) {
                this.offsets.set(id, current); return { moved: current - before, blocked: true };
            }
            current = next; this.offsets.set(id, current); this.movedPulls.add(id); this.probeBombs(id);
        }
        return { moved: current - before, blocked: false };
    }

    private releasePull(id: string): void {
        const current = this.offsets.get(id)!;
        if (this.removedPulls.has(id) || Math.abs(current) <= .7) return;
        // 松手才探测完整出口；沿途先处理实际炸弹接触，再检查剩余实体是否挡路。
        // 探测失败时不提交，成功时保留最后可见位置，供消除碎片取样。
        const snapshot = this.snapshot(), probe = new RotateRingsModel(this.level, snapshot);
        const sign = Math.sign(current), distance = this.pullExitDistance(id);
        for (let step = .08; step <= distance; step += .08) {
            probe.offsets.set(id, current + sign * step); probe.probeBombs(id); probe.commitBombs();
            if (probe.removedPulls.has(id)) break;
            if (probe.pullBlocked(id, current + sign * step)) return;
        }
        probe.removePart(id);
        this.restore({ ...probe.snapshot(), offsets: snapshot.offsets });
    }
    private pullExitDistance(id: string): number {
        const p = this.pulls.get(id)!, axis = G.polar(1, p.dragAxis);
        return Math.max(4, ...p.polyLocal.map(v => Math.abs(v.x * axis.x + v.y * axis.y))) * 2 + 4;
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
                const incident = this.level.links.map((l, i) => ({ l, i })).filter(({ l }) => l.sourceRingId === ring.id || l.targetPartId === ring.id);
                if (incident.length && incident.every(({ i }) => this.solved.has(i)) && !this.hasInterlock(ring.id)) {
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

    hint(): RingHint | undefined {
        // 提示只建议经同一碰撞内核验证过的操作，不穿墙、不强行消除。
        const snapshot = this.snapshot();
        const deadline = Date.now() + 140;
        let best: RingHint | undefined, bestProgress = -Infinity;
        const candidates: RingHint[] = [];
        for (let i = 0; i < this.level.links.length; i++) {
            if (this.solved.has(i)) continue;
            const link = this.level.links[i], source = this.pose(link.sourceRingId);
            const pin = this.pins(source.id).find(p => p.featureId === link.pinFeatureId)!;
            if (this.rings.has(link.targetPartId)) {
                const target = this.pose(link.targetPartId);
                if (target.gapWidth > 0) candidates.push({ kind: 'ring', id: target.id, target: G.angleTo(target, pin.shape.center) - target.gapDir });
                candidates.push({ kind: 'ring', id: source.id, target: G.angleTo(source, target) - pin.angleDeg });
                if (target.gapWidth <= 0) for (const delta of [-90, 90, 180]) {
                    candidates.push({ kind: 'ring', id: source.id, target: source.angle + delta });
                }
            }
        }
        for (const p of this.level.pullObjects) if (!this.removedPulls.has(p.id)) {
            if (p.positive) candidates.push({ kind: 'pull', id: p.id, target: 1.2 });
            if (p.negative) candidates.push({ kind: 'pull', id: p.id, target: -1.2 });
        }
        for (let index = 0; index < this.level.bombs.length; index++) if (!this.bombCleared(index)) {
            const bomb = this.level.bombs[index];
            const rings = bomb.ringId ? [this.rings.get(bomb.ringId)!] : this.level.rings.filter(r => !this.removedRings.has(r.id));
            for (const ring of rings) {
                const angle = this.angles.get(ring.id)!;
                candidates.push({ kind: 'ring', id: ring.id, target: angle + 45 }, { kind: 'ring', id: ring.id, target: angle - 45 });
            }
        }
        for (const candidate of candidates.slice(0, 48)) {
            if (Date.now() > deadline) break;
            const probe = new RotateRingsModel(this.level, snapshot);
            probe.beginGesture();
            const result = candidate.kind === 'ring' ? probe.rotateRing(candidate.id, candidate.target)
                : probe.dragPull(candidate.id, candidate.target);
            const moved = 'rotated' in result ? result.rotated : Math.abs(result.moved) * 30;
            if (moved < .1) continue;
            probe.endGesture(true);
            const value = (probe.progress - this.progress) * 1000 + moved;
            if (value > bestProgress) { bestProgress = value; best = candidate; }
            if (probe.progress > this.progress) break;
        }
        return best;
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
