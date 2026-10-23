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

/** 开局按完整旋转包络适配；局内旋转、消除和引导均不改变棋盘比例或中心。 */
export function fitRingBoard(level: RingLevel, width: number, height: number, visuals?: RingLevelVisuals,
    safetyWidth = width, safetyHeight = height): RingBoardTransform {
    const points: RingPoint[] = [];
    for (const r of level.rings) {
        const mesh = visuals?.[r.id];
        const radius = Math.max(r.outer, ...r.pins.map(p => p.radius + Math.hypot(p.mouthSize.x, p.mouthSize.y) / 2),
            ...level.bombs.filter(b => b.ringId === r.id).map(b => Math.hypot(b.x, b.y) + b.radius)) + .25;
        points.push({ x: r.x - radius, y: r.y - radius }, { x: r.x + radius, y: r.y + radius });
        if (mesh) for (let i = 0; i < mesh.vertices.length; i += 4) {
            const reach = Math.hypot(mesh.vertices[i], mesh.vertices[i + 1]);
            points.push({ x: r.x - reach, y: r.y - reach }, { x: r.x + reach, y: r.y + reach });
        }
    }
    for (const p of level.pullObjects) {
        const mesh = visuals?.[p.id], travel = G.polar(.9, pullAxisAngle(p));
        const local: RingPoint[] = [];
        if (mesh) for (let i = 0; i < mesh.vertices.length; i += 4) {
            const q = rotatePoint({ x: mesh.vertices[i], y: mesh.vertices[i + 1] }, p.angle);
            local.push({ x: p.x + q.x, y: p.y + q.y });
        } else local.push(...G.polygonWorld(p.polyLocal, p.x, p.y, p.angle));
        for (const point of local) for (const sign of [0, ...(p.negative ? [-1] : []), ...(p.positive ? [1] : [])]) {
            points.push({ x: point.x + travel.x * sign, y: point.y + travel.y * sign });
        }
    }
    for (const f of level.fixedObjects) {
        for (const poly of f.polygons) points.push(...G.polygonWorld(poly, f.x, f.y, f.angle));
    }
    if (level.bombs.length) {
        const pose = new RotateRingsModel(level);
        for (let i = 0; i < level.bombs.length; i++) {
            const bomb = level.bombs[i], radius = bomb.radius;
            if (bomb.ringId) {
                const host = level.rings.find(r => r.id === bomb.ringId)!;
                const reach = Math.max(Math.hypot(bomb.x, bomb.y), Math.hypot(bomb.visual?.x ?? bomb.x, bomb.visual?.y ?? bomb.y)) + radius;
                points.push({ x: host.x - reach, y: host.y - reach }, { x: host.x + reach, y: host.y + reach });
                continue;
            }
            for (const visual of [false, true]) {
                const p = pose.bombPoint(i, visual);
                const host = bomb.pullId ? level.pullObjects.find(pull => pull.id === bomb.pullId) : undefined;
                const travel = host ? G.polar(.9, pullAxisAngle(host)) : { x: 0, y: 0 };
                for (const sign of [0, ...(host?.negative ? [-1] : []), ...(host?.positive ? [1] : [])]) {
                    points.push({ x: p.x + travel.x * sign - radius, y: p.y + travel.y * sign - radius },
                        { x: p.x + travel.x * sign + radius, y: p.y + travel.y * sign + radius });
                }
            }
        }
    }
    if (!points.length) return { scale: 1, centerX: 0, centerY: 0 };
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const bounds = level.referenceBounds;
    if (bounds && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY) {
        const centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
        const reachX = Math.max(centerX - minX, maxX - centerX), reachY = Math.max(centerY - minY, maxY - centerY);
        // 原 bounds 已包含完整部件外缘；再减通用边距会使同一关的环与间距整体缩小。
        return { centerX, centerY, scale: Math.min(RING_MAX_BOARD_SCALE, width / (bounds.maxX - bounds.minX),
            height / (bounds.maxY - bounds.minY), safetyWidth / (reachX * 2), safetyHeight / (reachY * 2)) };
    }
    return { scale: Math.min(RING_MAX_BOARD_SCALE, (width - 40) / Math.max(1, maxX - minX), (height - 40) / Math.max(1, maxY - minY)),
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

export class RotateRingsBoard {
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
        this.transform = fitRingBoard(model.level, width, height, visuals, safetyWidth, safetyHeight);
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
        this.reframe(width, height, safetyWidth, safetyHeight);
        this.draw();
    }
    reframe(width: number, height: number, safetyWidth = width, safetyHeight = height): boolean {
        this.safetyWidth = safetyWidth; this.safetyHeight = safetyHeight;
        const next = fitRingBoard(this.model.level, width, height, this.visuals, safetyWidth, safetyHeight);
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
        for (const pull of this.model.level.pullObjects.slice().reverse()) {
            if (this.model.removedPulls.has(pull.id)) continue;
            const poly = this.model.pullPolygon(pull.id);
            if (G.pointInPolygon(world, poly) || poly.some(v => G.distance(v, world) < tolerance)) return { kind: 'pull', id: pull.id };
        }
        const ranked = this.model.level.rings.filter(r => !this.model.removedRings.has(r.id))
            .map(r => ({ r, distance: Math.abs(G.distance(world, r) - (r.inner + r.outer) / 2) }))
            .sort((a, b) => a.distance - b.distance);
        for (const { r } of ranked) {
            // 引导期间按正在显示的圆环命中，用户点到手指演示的位置即可接管，不会点进真实姿态的缺口。
            const pose = this.model.pose(r.id, this.guideAngle?.id === r.id ? this.guideAngle.angle : undefined);
            if (G.pointNearRingBand(world, pose, tolerance)) return { kind: 'ring', id: r.id };
        }
        return undefined;
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
                original.getComponent(RotateRingsMeshSprite)!.color = this.hint?.id === pull.id ? this.hintColor : this.partColors.get(pull.id)!;
                this.syncShadow(pull.id, original);
                continue;
            }
            if (this.model.removedPulls.has(pull.id)) continue;
            this.polygon(this.model.pullPolygon(pull.id), this.selected === pull.id || this.hint?.id === pull.id ? T.gold : '#AAA99C');
            const axis = G.polar(1, pullAxisAngle(pull)), offset = this.model.offsets.get(pull.id) || 0;
            const c = this.point({ x: pull.x + axis.x * offset, y: pull.y + axis.y * offset });
            const size = Math.max(8, Math.min(18, scale * .6));
            g.lineWidth = 2.5; g.strokeColor = ringColor('#FFFEFA');
            for (const sign of [-1, 1]) {
                if (sign < 0 ? !pull.negative : !pull.positive) continue;
                const x = c.x + axis.x * size * sign, y = c.y + axis.y * size * sign;
                g.moveTo(x - axis.y * size * .35 - axis.x * size * .45 * sign, y + axis.x * size * .35 - axis.y * size * .45 * sign);
                g.lineTo(x, y);
                g.lineTo(x + axis.y * size * .35 - axis.x * size * .45 * sign, y - axis.x * size * .35 - axis.y * size * .45 * sign); g.stroke();
            }
        }
        for (const ring of this.model.level.rings) {
            const c = this.point(ring), hex = T.colors[(ring.index - 1) % T.colors.length];
            const original = this.meshNodes.get(ring.id);
            if (original) {
                const removed = this.model.removedRings.has(ring.id);
                if (removed && !this.removed.has(ring.id)) { this.removed.add(ring.id); this.onRelease?.(ring.id, this.model.angles.get(ring.id)!); }
                original.active = !removed;
                if (removed) { this.syncShadow(ring.id, original); continue; }
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
            const q = G.polar(r.outer * scale + 16, a);
            g.lineWidth = 3; g.strokeColor = ringColor(T.primary, 180); g.circle(c.x + q.x, c.y + q.y, 12); g.stroke();
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
