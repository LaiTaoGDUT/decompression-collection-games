import { Color, Graphics, Material, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import type { RingHint, RingLevel, RingPoint } from './RotateRingsTypes';
import { pullAxisAngle, RotateRingsModel } from './RotateRingsModel';
import * as G from './RotateRingsGeometry';
import { RING_THEME as T } from './RotateRingsTheme';
import { RotateRingsMeshSprite } from './RotateRingsMeshSprite';
import type { RingLevelVisuals } from './RotateRingsVisuals';
import { RING_MOTION, ringCurve } from './RotateRingsEffects';
import { RING_MAX_BOARD_SCALE } from './RotateRingsLayout';

export function ringColor(hex: string, alpha = 255): Color { const c = new Color(); Color.fromHEX(c, hex); c.a = alpha; return c; }
export interface RingBoardTransform { scale: number; centerX: number; centerY: number; }
function rotatePoint(p: RingPoint, angle: number): RingPoint {
    const a = angle * G.DEG, c = Math.cos(a), s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** 计算部件完整的旋转和滑动包络。局内只改变视口，部件的初始范围固定。 */
function measureRingBoard(level: RingLevel, visuals?: RingLevelVisuals) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    function include(x: number, y: number, radius = 0): void {
        minX = Math.min(minX, x - radius); maxX = Math.max(maxX, x + radius);
        minY = Math.min(minY, y - radius); maxY = Math.max(maxY, y + radius);
    }
    for (const r of level.rings) {
        const mesh = visuals?.[r.id];
        let radius = Math.max(r.outer, ...r.pins.map(p => p.radius + Math.hypot(p.mouthSize.x, p.mouthSize.y) / 2),
            ...level.bombs.filter(b => b.ringId === r.id).map(b => Math.hypot(b.x, b.y) + b.radius));
        if (mesh) for (let i = 0; i < mesh.vertices.length; i += 4) {
            radius = Math.max(radius, Math.hypot(mesh.vertices[i], mesh.vertices[i + 1]));
        }
        // 将入场回弹的余量留在最终外缘，网格有时比碰撞体更宽。
        include(r.x, r.y, radius + .25);
    }
    for (const p of level.pullObjects) {
        const mesh = visuals?.[p.id], travel = G.polar(.9, pullAxisAngle(p));
        const cos = Math.cos(p.angle * G.DEG), sin = Math.sin(p.angle * G.DEG);
        const vertex = (x: number, y: number) => {
            const cx = p.x + (x * cos - y * sin), cy = p.y + (x * sin + y * cos);
            include(cx, cy);
            include(cx - travel.x, cy - travel.y);
            include(cx + travel.x, cy + travel.y);
        };
        if (mesh) for (let i = 0; i < mesh.vertices.length; i += 4) vertex(mesh.vertices[i], mesh.vertices[i + 1]);
        else for (const v of p.polyLocal) vertex(v.x, v.y);
    }
    for (const f of level.fixedObjects) {
        for (const poly of f.polygons) for (const v of G.polygonWorld(poly, f.x, f.y, f.angle)) include(v.x, v.y);
    }
    if (level.bombs.length) {
        const pose = new RotateRingsModel(level);
        for (let i = 0; i < level.bombs.length; i++) {
            const bomb = level.bombs[i], radius = bomb.radius;
            if (bomb.ringId) {
                const host = pose.rings.get(bomb.ringId)!;
                const reach = Math.max(Math.hypot(bomb.x, bomb.y), Math.hypot(bomb.visual?.x ?? bomb.x, bomb.visual?.y ?? bomb.y)) + radius;
                include(host.x, host.y, reach);
                continue;
            }
            const host = bomb.pullId ? pose.pulls.get(bomb.pullId) : undefined;
            const travel = host ? G.polar(.9, pullAxisAngle(host)) : undefined;
            for (const visual of [false, true]) {
                const p = pose.bombPoint(i, visual);
                include(p.x, p.y, radius);
                if (travel) include(p.x - travel.x, p.y - travel.y, radius);
                if (travel) include(p.x + travel.x, p.y + travel.y, radius);
            }
        }
    }
    return { minX, maxX, minY, maxY };
}

function fitMeasuredBoard(level: RingLevel, extent: ReturnType<typeof measureRingBoard>,
    width: number, height: number, safetyWidth: number, safetyHeight: number): RingBoardTransform {
    const { minX, maxX, minY, maxY } = extent;
    if (minX === Infinity) return { scale: 1, centerX: 0, centerY: 0 };
    const bounds = level.referenceBounds;
    if (bounds && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY) {
        const centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
        const reachX = Math.max(centerX - minX, maxX - centerX), reachY = Math.max(centerY - minY, maxY - centerY);
        // 原 bounds 已包含完整部件外缘；再减通用边距会使同一关的环与间距整体缩小。
        return { centerX, centerY, scale: Math.min(RING_MAX_BOARD_SCALE, width / (bounds.maxX - bounds.minX),
            height / (bounds.maxY - bounds.minY), safetyWidth / (reachX * 2), safetyHeight / (reachY * 2)) };
    }
    return { scale: Math.min(RING_MAX_BOARD_SCALE, Math.min(width, safetyWidth) / Math.max(1, maxX - minX),
        Math.min(height, safetyHeight) / Math.max(1, maxY - minY)),
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

export function fitRingBoard(level: RingLevel, width: number, height: number, visuals?: RingLevelVisuals,
    safetyWidth = width, safetyHeight = height): RingBoardTransform {
    return fitMeasuredBoard(level, measureRingBoard(level, visuals), width, height, safetyWidth, safetyHeight);
}

export class RotateRingsBoard {
    private readonly extent: ReturnType<typeof measureRingBoard>;
    readonly transform: RingBoardTransform;
    selected?: string;
    hint?: RingHint;
    guideAngle?: { id: string; angle: number };
    guidePoints: readonly RingPoint[] = [];
    private removed = new Set<string>();
    private clock = 0;
    private meshNodes = new Map<string, Node>();
    private shadowNodes = new Map<string, Node>();
    private blockedAt = new Map<string, number>();
    private bombNodes: Node[] = [];
    private fixedNodes = new Map<string, Node>();
    /** 卡扣、炸弹等精灵物件的投影，与网格阴影同在底层，按主题偏移跟随本体。 */
    private spriteShadows = new Map<Node, Node>();
    private readonly partColors = new Map<string, Color>();
    private readonly hintColor = ringColor(T.gold);

    constructor(readonly model: RotateRingsModel, private readonly graphics: Graphics, width: number, height: number,
        private readonly visuals?: RingLevelVisuals, private readonly frames?: Readonly<Record<string, SpriteFrame>>, entry = false,
        material?: Material, private safetyWidth = width, private safetyHeight = height, shadowMaterial?: Material,
        private readonly onRelease?: (id: string, angle: number) => void) {
        this.extent = measureRingBoard(model.level, visuals);
        this.transform = fitMeasuredBoard(model.level, this.extent, width, height, safetyWidth, safetyHeight);
        this.clock = entry ? 0 : 999;
        model.removedRings.forEach(id => this.removed.add(id));
        model.removedPulls.forEach(id => this.removed.add(id));
        if (visuals && frames) {
            if (!material || !shadowMaterial) throw new Error('RotateRings ceramic/shadow material is missing');
            // 原 UnderlayProxy 先画所有阴影，再画主网格；两个独立材质保留各自深度写入规则。
            const shadows = new Node('OriginalUnderlay'); shadows.layer = graphics.node.layer; shadows.setParent(graphics.node);
            shadows.addComponent(UITransform).setContentSize(width, height);
            for (const part of [...model.level.rings, ...model.level.pullObjects]) {
                const mesh = visuals[part.id]; if (!mesh) throw new Error(`Original part mesh missing: ${part.id}`);
                const node = new Node(`Original-${part.id}`); node.layer = graphics.node.layer; node.setParent(graphics.node);
                node.addComponent(UITransform).setContentSize(6, 6);
                const sprite = node.addComponent(RotateRingsMeshSprite);
                const color = ringColor(mesh.color); this.partColors.set(part.id, color);
                sprite.configure(mesh, frames['ring-texture'], material); sprite.color = color;
                this.meshNodes.set(part.id, node);
                const shadow = new Node(`Shadow-${part.id}`); shadow.layer = graphics.node.layer; shadow.setParent(shadows);
                shadow.addComponent(UITransform).setContentSize(6, 6);
                shadow.addComponent(RotateRingsMeshSprite).configure(mesh, frames['ring-texture'], shadowMaterial);
                this.shadowNodes.set(part.id, shadow);
            }
            for (const fixed of model.level.fixedObjects) {
                const node = new Node(`Original-${fixed.id}`); node.layer = graphics.node.layer; node.setParent(graphics.node);
                node.addComponent(UITransform).setContentSize(.96 * this.transform.scale, .96 * this.transform.scale);
                const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frames.catch;
                const p = this.point(fixed); node.setPosition(p.x, p.y); node.angle = fixed.angle;
                this.fixedNodes.set(fixed.id, node); this.addSpriteShadow(node, shadows, frames.catch);
            }
            for (const bomb of model.level.bombs) {
                const node = new Node('OriginalBomb'); node.layer = graphics.node.layer; node.setParent(graphics.node);
                const diameter = bomb.radius * 2 * this.transform.scale;
                node.addComponent(UITransform).setContentSize(diameter, diameter);
                const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frames.bomb;
                this.bombNodes.push(node); this.addSpriteShadow(node, shadows, frames.bomb);
            }
        }
    }

    resize(width: number, height: number, safetyWidth = width, safetyHeight = height): void {
        if (this.reframe(width, height, safetyWidth, safetyHeight)) this.draw();
    }
    reframe(width: number, height: number, safetyWidth = width, safetyHeight = height): boolean {
        this.safetyWidth = safetyWidth; this.safetyHeight = safetyHeight;
        const next = fitMeasuredBoard(this.model.level, this.extent, width, height, safetyWidth, safetyHeight);
        const changed = Math.abs(next.scale - this.transform.scale) > .0001
            || next.centerX !== this.transform.centerX || next.centerY !== this.transform.centerY;
        Object.assign(this.transform, next); return changed;
    }
    /** 固定比例下滑杆的完整可见外形始终留在内容区，仍保留超过退出阈值的行程。 */
    limitPullDelta(id: string, delta: number): number {
        const pull = this.model.pulls.get(id)!, mesh = this.visuals?.[id], axis = G.polar(1, pullAxisAngle(pull));
        const points = this.model.pullPolygon(id).slice(), offset = this.model.offsets.get(id) ?? 0;
        if (mesh) for (let i = 0; i < mesh.vertices.length; i += 4) {
            const p = rotatePoint({ x: mesh.vertices[i], y: mesh.vertices[i + 1] }, pull.angle);
            points.push({ x: pull.x + p.x + axis.x * offset, y: pull.y + p.y + axis.y * offset });
        }
        this.model.level.bombs.forEach((bomb, index) => {
            if (bomb.pullId !== id || this.model.bombCleared(index)) return;
            for (const visual of [false, true]) {
                const p = this.model.bombPoint(index, visual);
                points.push({ x: p.x - bomb.radius, y: p.y - bomb.radius }, { x: p.x + bomb.radius, y: p.y + bomb.radius });
            }
        });
        let low = -Infinity, high = Infinity;
        for (const point of points) for (const [value, direction, center, size] of [
            [point.x, axis.x, this.transform.centerX, this.safetyWidth], [point.y, axis.y, this.transform.centerY, this.safetyHeight],
        ]) {
            if (Math.abs(direction) < 1e-8) continue;
            const first = (center - size / (2 * this.transform.scale) - value) / direction;
            const last = (center + size / (2 * this.transform.scale) - value) / direction;
            low = Math.max(low, Math.min(first, last)); high = Math.min(high, Math.max(first, last));
        }
        return Math.max(Math.min(0, low), Math.min(Math.max(0, high), delta));
    }
    get animating(): boolean {
        if (this.clock < RING_MOTION.waveDuration + this.model.level.rings.length * RING_MOTION.waveInterval) return true;
        for (const at of this.blockedAt.values()) if (this.clock - at < RING_MOTION.blockedShakeDuration) return true;
        // 提示标记本身是静态的；手指/演示姿态由 Guide 推进并请求重画。
        return false;
    }
    blocked(id: string): void { if (this.clock - (this.blockedAt.get(id) ?? -999) >= RING_MOTION.blockedShakeDuration) this.blockedAt.set(id, this.clock); }
    point(p: RingPoint): RingPoint { const t = this.transform; return { x: (p.x - t.centerX) * t.scale, y: (p.y - t.centerY) * t.scale }; }
    world(p: RingPoint): RingPoint { const t = this.transform; return { x: p.x / t.scale + t.centerX, y: p.y / t.scale + t.centerY }; }
    hit(p: RingPoint): { kind: 'ring' | 'pull'; id: string } | undefined {
        const world = this.world(p), tolerance = 16 / this.transform.scale;
        let best: { kind: 'ring' | 'pull'; id: string } | undefined, nearest = Infinity;
        for (const pull of this.model.level.pullObjects.slice().reverse()) {
            if (this.model.removedPulls.has(pull.id)) continue;
            const distance = G.polygonTouchDistance(world, this.model.pullPolygon(pull.id));
            if (distance <= tolerance && distance < nearest) {
                nearest = distance; best = { kind: 'pull', id: pull.id };
            }
        }
        for (const ring of this.model.level.rings) {
            if (this.model.removedRings.has(ring.id) || G.distance(world, ring) > ring.outer + tolerance) continue;
            const pose = this.model.pose(ring.id, this.guideAngle?.id === ring.id ? this.guideAngle.angle : undefined);
            const distance = G.ringTouchDistance(world, pose);
            if (distance <= tolerance && distance < nearest) {
                nearest = distance; best = { kind: 'ring', id: ring.id };
            }
        }
        return best;
    }
    draw(delta = 0): void {
        this.clock += delta;
        const g = this.graphics, scale = this.transform.scale;
        g.clear();
        for (const fixed of this.model.level.fixedObjects) {
            const original = this.fixedNodes.get(fixed.id);
            if (original) {
                original.active = !this.model.removedFixed.has(fixed.id);
                const p = this.point(fixed); original.setPosition(p.x, p.y);
                original.getComponent(UITransform)!.setContentSize(.96 * scale, .96 * scale); this.syncSpriteShadow(original); continue;
            }
            if (this.model.removedFixed.has(fixed.id)) continue;
            for (const local of fixed.polygons) this.polygon(G.polygonWorld(local, fixed.x, fixed.y, fixed.angle), '#D6D5CB');
        }
        for (const pull of this.model.level.pullObjects) {
            const original = this.meshNodes.get(pull.id);
            if (original) {
                original.active = !this.model.removedPulls.has(pull.id);
                if (!original.active) {
                    if (!this.removed.has(pull.id)) { this.removed.add(pull.id); this.onRelease?.(pull.id, pull.angle); }
                    this.syncShadow(pull.id, original); continue;
                }
                const axis = G.polar(this.model.offsets.get(pull.id) || 0, pullAxisAngle(pull)), p = this.point({ x: pull.x + axis.x, y: pull.y + axis.y });
                original.setPosition(p.x, p.y); original.angle = pull.angle; original.setScale(scale, scale, 1);
                const blocked = this.clock - (this.blockedAt.get(pull.id) ?? -999) < RING_MOTION.blockedShakeDuration;
                original.getComponent(RotateRingsMeshSprite)!.color = blocked || this.hint?.id === pull.id ? this.hintColor : this.partColors.get(pull.id)!;
                this.syncShadow(pull.id, original);
                continue;
            }
            if (this.model.removedPulls.has(pull.id)) continue;
            this.polygon(this.model.pullPolygon(pull.id), this.selected === pull.id || this.hint?.id === pull.id ? T.gold : '#AAA99C');
        }
        for (const ring of this.model.level.rings) {
            const c = this.point(ring), hex = T.colors[(ring.index - 1) % T.colors.length];
            const original = this.meshNodes.get(ring.id);
            if (original) {
                const removed = this.model.removedRings.has(ring.id);
                if (removed && !this.removed.has(ring.id)) { this.removed.add(ring.id); this.onRelease?.(ring.id, this.model.angles.get(ring.id)!); }
                original.active = !removed;
                if (removed) { this.syncShadow(ring.id, original); continue; }
                original.getComponent(RotateRingsMeshSprite)!.color = this.hint?.id === ring.id ? this.hintColor : this.partColors.get(ring.id)!;
                const entrance = Math.max(0, Math.min(1, (this.clock - (ring.index - 1) * RING_MOTION.waveInterval) / RING_MOTION.waveDuration));
                const size = ringCurve(RING_MOTION.scaleCurve.m_Curve, entrance);
                original.setScale(scale * size, scale * size, 1);
                const bumpAge = this.clock - (this.blockedAt.get(ring.id) ?? -999);
                const shake = bumpAge < RING_MOTION.blockedShakeDuration ? ringCurve(RING_MOTION.blockedShakeCurve.m_Curve, bumpAge / RING_MOTION.blockedShakeDuration) * RING_MOTION.blockedShakeStrength : 0;
                const angle = this.guideAngle?.id === ring.id ? this.guideAngle.angle : this.model.angles.get(ring.id)!;
                original.angle = angle + (shake && !this.model.blockReason(ring.id, angle + shake) ? shake : 0);
                original.setPosition(c.x, c.y);
                this.syncShadow(ring.id, original);
                continue;
            }
            if (this.model.removedRings.has(ring.id)) {
                if (!this.removed.has(ring.id)) { this.removed.add(ring.id); this.onRelease?.(ring.id, this.model.angles.get(ring.id)!); }
                continue;
            }
            this.removed.delete(ring.id);
            const pose = this.model.pose(ring.id), radius = (ring.inner + ring.outer) * scale / 2;
            const width = (ring.outer - ring.inner) * scale;
            const gap = ring.gapWidth > 0 ? Math.max(ring.renderGap, 30) : 0;
            const start = (pose.angle + ring.gapDir + gap / 2) * G.DEG, end = start + (360 - gap) * G.DEG;
            g.lineWidth = width + 3; g.strokeColor = ringColor('#58665F', 42); this.arc({ x: c.x, y: c.y - 4 }, radius, start, end);
            g.lineWidth = width; g.strokeColor = ringColor(hex); this.arc(c, radius, start, end);
            g.lineWidth = Math.max(1.5, width * .18); g.strokeColor = ringColor('#FFFFFF', 125);
            this.arc({ x: c.x, y: c.y + width * .14 }, radius - width * .16, start + .03, end - .03);
            if (gap > 0) {
                for (const angle of [start, end]) { g.fillColor = ringColor(hex); g.circle(c.x + Math.cos(angle) * radius, c.y + Math.sin(angle) * radius, width / 2); g.fill(); }
                const opening = G.polar(radius, pose.angle + ring.gapDir);
                g.fillColor = ringColor(hex, 65); g.circle(c.x + opening.x, c.y + opening.y, Math.max(3, width * .24)); g.fill();
            }
            for (const pin of this.model.pins(ring.id)) {
                const center = this.point(pin.shape.center), radial = G.polar(ring.outer * scale - width / 3, pose.angle + pin.angleDeg);
                g.lineWidth = Math.max(4, scale * .30); g.strokeColor = ringColor(hex);
                g.moveTo(c.x + radial.x, c.y + radial.y); g.lineTo(center.x, center.y); g.stroke();
                // 叉口保持透明，爪和端部共同显示真实朝向。
                const axisY = pin.shape.mouth.axisY, mouth = pin.shape.mouth;
                const reach = Math.max(width * .7, mouth.hy * scale);
                g.lineWidth = Math.max(3, scale * .13);
                const d = mouth.hx * scale;
                for (const sign of [-1, 1]) {
                    const px = center.x + mouth.axisX.x * d * sign, py = center.y + mouth.axisX.y * d * sign;
                    g.moveTo(px - axisY.x * reach, py - axisY.y * reach); g.lineTo(px + axisY.x * reach, py + axisY.y * reach); g.stroke();
                }
                g.moveTo(center.x - mouth.axisX.x * d - axisY.x * reach, center.y - mouth.axisX.y * d - axisY.y * reach);
                g.lineTo(center.x + mouth.axisX.x * d - axisY.x * reach, center.y + mouth.axisX.y * d - axisY.y * reach); g.stroke();
            }
        }
        for (let i = 0; i < this.model.level.bombs.length; i++) {
            const b = this.model.level.bombs[i], original = this.bombNodes[i];
            if (original) {
                original.active = !this.model.bombCleared(i);
                if (original.active) {
                    const c = this.point(this.model.bombPoint(i, true)); original.setPosition(c.x, c.y); original.angle = this.model.bombAngle(i);
                    original.getComponent(UITransform)!.setContentSize(b.radius * 2 * scale, b.radius * 2 * scale);
                }
                this.syncSpriteShadow(original); continue;
            }
            if (this.model.bombCleared(i)) continue;
            const c = this.point(this.model.bombPoint(i, true));
            g.fillColor = ringColor('#66716C'); g.circle(c.x, c.y, Math.max(5, b.radius * scale)); g.fill();
            g.fillColor = ringColor(T.gold); g.circle(c.x + 3, c.y + b.radius * scale, 3); g.fill();
        }
        if (this.hint?.kind === 'ring' && !this.model.removedRings.has(this.hint.id)) {
            const r = this.model.pose(this.hint.id), c = this.point(r), a = this.hint.target + r.gapDir;
            const axis = G.polar(1, a), radius = 12, stroke = 3, inset = radius + stroke / 2;
            // 靠边时让标记沿缺口方向靠近环身，保持整圈可见。
            const reach = (center: number, unit: number, size: number) => Math.abs(unit) < 1e-8 ? Infinity
                : (size / 2 - inset - Math.sign(unit) * center) / Math.abs(unit);
            const distance = Math.max(0, Math.min(r.outer * scale + 16, reach(c.x, axis.x, this.safetyWidth),
                reach(c.y, axis.y, this.safetyHeight)));
            g.lineWidth = stroke; g.strokeColor = ringColor(T.primary, 180);
            g.circle(c.x + axis.x * distance, c.y + axis.y * distance, radius); g.stroke();
        }
    }
    private addSpriteShadow(original: Node, layer: Node, frame: SpriteFrame): void {
        const shadow = new Node(`Shadow-${original.name}`); shadow.layer = layer.layer; shadow.setParent(layer);
        shadow.addComponent(UITransform);
        const sprite = shadow.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
        sprite.color = ringColor(T.shadow, Math.round(T.boardShadow.alpha * 255));
        this.spriteShadows.set(original, shadow);
    }
    private syncSpriteShadow(original: Node): void {
        const shadow = this.spriteShadows.get(original); if (!shadow) return;
        const scale = this.transform.scale, size = original.getComponent(UITransform)!.contentSize;
        shadow.active = original.active; shadow.angle = original.angle;
        shadow.setPosition(original.position.x + T.boardShadow.offsetX * scale, original.position.y + T.boardShadow.offsetY * scale);
        shadow.getComponent(UITransform)!.setContentSize(size.width, size.height);
    }
    private syncShadow(id: string, original: Node): void {
        const shadow = this.shadowNodes.get(id); if (!shadow) return;
        shadow.active = original.active; shadow.setPosition(original.position); shadow.setScale(original.scale); shadow.angle = original.angle;
        shadow.getComponent(RotateRingsMeshSprite)!.color = original.getComponent(RotateRingsMeshSprite)!.color;
    }
    private arc(c: RingPoint, radius: number, start: number, end: number): void {
        const g = this.graphics, steps = Math.max(8, Math.ceil((end - start) / .065));
        for (let i = 0; i <= steps; i++) { const a = start + (end - start) * i / steps;
            if (i === 0) g.moveTo(c.x + radius * Math.cos(a), c.y + radius * Math.sin(a)); else g.lineTo(c.x + radius * Math.cos(a), c.y + radius * Math.sin(a)); }
        g.stroke();
    }
    private polygon(poly: RingPoint[], hex: string): void {
        if (!poly.length) return;
        const g = this.graphics; g.fillColor = ringColor(hex); g.strokeColor = ringColor('#858C82', 100); g.lineWidth = 1.5;
        poly.forEach((p, i) => { const c = this.point(p); if (i === 0) g.moveTo(c.x, c.y); else g.lineTo(c.x, c.y); });
        g.close(); g.fill(); g.stroke();
    }
}
