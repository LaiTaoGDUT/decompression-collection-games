import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { RingHint } from './RotateRingsTypes';
import { RotateRingsBoard } from './RotateRingsBoard';
import * as G from './RotateRingsGeometry';
import { fitRingGuideHand } from './RotateRingsLayout';
import type { RingPoint } from './RotateRingsTypes';
import { RotateRingsModel } from './RotateRingsModel';

/** 手指和演示姿态只影响显示，不写入模型或消耗提示；实际触摸开始时恢复真实盘面。 */
export class RotateRingsGuide {
    private hand?: Node;
    private elapsed = 0;
    private hint?: RingHint;
    private pullContact?: RingPoint;
    constructor(private readonly board: RotateRingsBoard, private readonly parent: Node, private readonly frame: SpriteFrame) {}
    get active(): boolean { return !!this.hand?.isValid; }
    start(hint: RingHint): void {
        this.dispose(); this.elapsed = 0;
        const model = this.board.model;
        // 演示沿实际可走的路径停止，不能把未解开的实体当作已经消失。
        if (hint.kind === 'ring') {
            const probe = new RotateRingsModel(model.level, model.snapshot()); probe.beginGesture();
            probe.rotateRing(hint.id, hint.target);
            hint = { ...hint, target: probe.angles.get(hint.id)! };
        }
        this.hint = hint;
        if (hint.kind === 'ring') {
            const ring = model.pose(hint.id), delta = G.angleDiff(hint.target, ring.angle);
            const start = ring.angle + ring.gapDir + Math.max(ring.gapWidth / 2, ring.renderGap / 2) + 24;
            this.board.guidePoints = Array.from({ length: 49 }, (_, index) => {
                const p = G.polar((ring.inner + ring.outer) / 2, start + delta * index / 48);
                return { x: ring.x + p.x, y: ring.y + p.y };
            });
        } else {
            const pull = model.pulls.get(hint.id)!;
            const polygon = model.pullPolygon(hint.id);
            // 凹形滑杆的质心可能落在空隙里，选择真正可命中的实体触点。
            this.pullContact = polygon.find(p => this.board.hit(this.board.point(p))?.id === hint.id) ?? polygon[0];
            const end = G.addP(this.pullContact, G.polar(hint.target, model.pullAxis(pull.id)));
            this.board.guidePoints = [this.pullContact, end];
        }
        const hand = new Node('OriginalGuideHand'); hand.layer = this.parent.layer; hand.setParent(this.parent);
        const transform = hand.addComponent(UITransform);
        transform.setContentSize(100, 100 * this.frame.originalSize.height / this.frame.originalSize.width);
        transform.setAnchorPoint(.15, .90);
        const sprite = hand.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.frame;
        hand.addComponent(UIOpacity); this.hand = hand; this.render();
    }
    update(delta: number): void { if (this.active) { this.elapsed += Math.max(0, delta); this.render(); } }
    dispose(): void {
        this.board.guideAngle = undefined;
        this.board.guidePoints = []; this.pullContact = undefined;
        if (this.hand?.isValid) { this.hand.removeFromParent(); this.hand.destroy(); }
        this.hand = undefined; this.hint = undefined;
    }
    private render(): void {
        const hand = this.hand, hint = this.hint;
        if (!hand || !hint) return;
        const phase = this.elapsed % 2.6, t = Math.max(0, Math.min(1, (phase - .45) / 1.25));
        const progress = t * t * (3 - 2 * t), model = this.board.model;
        hand.getComponent(UIOpacity)!.opacity = Math.round(255 * Math.min(1, phase / .25, (2.6 - phase) / .3));
        if (hint.kind === 'ring') {
            if (model.removedRings.has(hint.id)) { this.dispose(); return; }
            const ring = model.pose(hint.id), delta = G.angleDiff(hint.target, ring.angle);
            const start = ring.angle + ring.gapDir + Math.max(ring.gapWidth / 2, ring.renderGap / 2) + 24;
            const radius = (ring.inner + ring.outer) / 2, point = G.polar(radius, start + delta * progress);
            const p = this.board.point({ x: ring.x + point.x, y: ring.y + point.y }); hand.setPosition(p.x, p.y);
            this.board.guideAngle = { id: ring.id, angle: ring.angle + delta * progress };
        } else {
            const pull = model.pulls.get(hint.id);
            if (!pull || model.removedPulls.has(hint.id)) { this.dispose(); return; }
            const axis = G.polar(hint.target * progress, model.pullAxis(pull.id)), contact = this.pullContact!;
            const p = this.board.point({ x: contact.x + axis.x, y: contact.y + axis.y }); hand.setPosition(p.x, p.y);
        }
        const area = this.parent.getComponent(UITransform)!, size = hand.getComponent(UITransform)!;
        const scale = fitRingGuideHand(hand.position, size.width, size.height,
            { left: -area.width / 2, right: area.width / 2, bottom: -area.height / 2, top: area.height / 2 });
        hand.setScale(scale.x, scale.y, 1);
    }
}
