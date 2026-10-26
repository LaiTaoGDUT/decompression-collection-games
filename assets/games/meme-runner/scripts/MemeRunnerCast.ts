import { Color, Graphics, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { compressorPose, hopperMotion, RUNNER, type MemeRunnerModel, type RunnerDevice } from './MemeRunnerModel';
import { KANGAROO_RUN_FRAME_COUNT, stopMotionFrame } from './MemeRunnerMotion';
import { V48_ART } from './MemeRunnerArtV48';
import { CART_DECK_Y, RIDER_SEAT_Y } from './MemeRunnerRideAnchors';

/** The kangaroo is the only supporting character; every course interaction is a street machine. */
export const CAST_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> = [
    ...Array.from({ length: KANGAROO_RUN_FRAME_COUNT + 2 }, (_, i) => ({ key: `kangaroo-${i}`, path: `visual/v42/frames/kangaroo-${i}/spriteFrame` })),
    ...['friend-pin', 'friend-ring'].map(key => ({ key, path: `visual/v42/frames/${key}/spriteFrame` })),
];
interface CastView { node: Node; sprite: Sprite; opacity: UIOpacity; frame: string; pin?: Node; ring?: Node; }

export class MemeRunnerCast {
    readonly actors = new Map<number, CastView>();
    private readonly pursuer: CastView;
    constructor(private readonly parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.pursuer = this.create('kangaroo', 'Pursuer');
    }
    private create(kind: string, name: string): CastView {
        const enemy = kind === 'stomper' || kind === 'electric';
        const [w, h] = kind === 'kangaroo' ? [176, 176] : enemy ? [84, 98] : V48_ART[`${kind}-0`].size;
        const node = new Node(name); node.layer = this.parent.layer; node.parent = this.parent;
        const transform = node.addComponent(UITransform); transform.setContentSize(w, h); transform.setAnchorPoint(.5, 0);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
        const opacity = node.addComponent(UIOpacity);
        if (enemy) {
            const marking = new Node('EnemyContactMark'); marking.layer = node.layer; marking.parent = node;
            const g = marking.addComponent(Graphics);
            g.strokeColor = new Color(kind === 'stomper' ? '#86FFE0' : '#FFC069'); g.lineWidth = 6;
            if (kind === 'stomper') {
                g.moveTo(-31, 76); g.lineTo(31, 76); g.stroke();
                g.moveTo(-9, 94); g.lineTo(0, 85); g.lineTo(9, 94); g.stroke();
            } else {
                g.moveTo(5, 103); g.lineTo(-7, 87); g.lineTo(6, 87); g.lineTo(-4, 70); g.stroke();
                g.strokeColor = new Color('#ED73FF'); g.lineWidth = 4;
                g.roundRect(-44, -2, 88, 82, 10); g.stroke();
            }
        }
        if (kind === 'compressor') {
            const signal = new Node('ChargeSignal'); signal.layer = node.layer; signal.parent = node;
            const g = signal.addComponent(Graphics); g.fillColor = new Color('#FFAE51'); g.circle(35, 100, 8); g.fill();
        }
        if (kind !== 'launcher' && kind !== 'cart') return { node, sprite, opacity, frame: '' };
        const ring = this.marker('DeviceLandingRing', this.parent, 'friend-ring', 200, 48);
        ring.setSiblingIndex(node.getSiblingIndex()); ring.addComponent(UIOpacity);
        return { node, sprite, opacity, frame: '', pin: this.marker('DeviceLandingPin', node, 'friend-pin', 56, 64), ring };
    }
    private marker(name: string, parent: Node, key: string, w: number, h: number): Node {
        const n = new Node(name); n.layer = parent.layer; n.parent = parent; n.addComponent(UITransform).setContentSize(w, h);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames[key];
        return n;
    }
    private destroy(view: CastView): void {
        for (const s of view.node.getComponentsInChildren(Sprite)) s.spriteFrame = null;
        if (view.ring) { view.ring.getComponent(Sprite)!.spriteFrame = null; view.ring.destroy(); }
        view.node.destroy();
    }
    private setFrame(view: CastView, key: string): void {
        if (view.frame === key) return;
        view.frame = key; view.sprite.spriteFrame = this.frames[key];
    }
    update(model: MemeRunnerModel, heroX: number, floor: number, left: number, right: number, clock: number, endingAge = 0, entry?: { pursuerX: number }): void {
        const present = new Set<number>();
        for (const c of model.devices) {
            const x = heroX + c.x + c.width / 2 + c.offset - model.x;
            if (!c.active || x < left - 150 || x > right + 150) continue;
            present.add(c.id); let view = this.actors.get(c.id);
            if (!view) { view = this.create(c.kind, `Device-${c.kind}-${c.id}`); this.actors.set(c.id, view); }
            view.node.setPosition(x, floor + c.y); view.opacity.opacity = 255;
            this.setFrame(view, `${c.kind === 'stomper' || c.kind === 'electric' ? 'hopper' : c.kind}-${this.frame(c, model)}`);
            if (c.kind === 'stomper' || c.kind === 'electric') view.sprite.color = new Color(c.kind === 'stomper' ? '#A7E9DB' : '#D59FE8');
            if (c.kind === 'compressor') {
                const pose = compressorPose(c.visibleAge), signal = view.node.getChildByName('ChargeSignal')!;
                signal.active = pose > 0;
                view.sprite.color = new Color(pose === 2 ? '#FFD18A' : pose === 1 ? '#FFF0CD' : '#FFFFFF');
                signal.setScale(pose === 2 ? 1.2 : 1, pose === 2 ? 1.2 : 1, 1);
            }
            if (view.pin && view.ring) {
                const available = !c.used && !model.mounted && (c.kind === 'launcher' || model.feverTime <= 0);
                view.pin.active = view.ring.active = available;
                if (available) {
                    view.pin.setPosition(0, c.height + 48 + 6 * Math.sin(model.time * 5));
                    view.ring.setPosition(x, floor + c.y + 4); view.ring.setScale(c.width * 1.15 / 200, 1, 1);
                    view.ring.getComponent(UIOpacity)!.opacity = 190 + Math.round(55 * Math.sin(model.time * 5));
                }
            }
        }
        for (const [id, view] of Array.from(this.actors.entries())) if (!present.has(id)) { this.destroy(view); this.actors.delete(id); }
        const offscreen = left - 115, caught = model.ended && !model.delivered;
        const approach = offscreen + (heroX - 155 - offscreen) * model.chase;
        const chaseX = entry?.pursuerX ?? (caught ? approach + (heroX - 65 - approach) * Math.min(1, endingAge / .7)
            : model.delivered ? approach - 420 * endingAge : approach);
        this.pursuer.node.setPosition(chaseX, floor);
        this.pursuer.opacity.opacity = model.delivered ? Math.round(255 * Math.max(0, 1 - endingAge / .5)) : 255;
        this.setFrame(this.pursuer, `kangaroo-${caught ? KANGAROO_RUN_FRAME_COUNT + (endingAge < 1 / 6 ? 0 : 1) : stopMotionFrame(clock, KANGAROO_RUN_FRAME_COUNT)}`);
    }
    /** Align the painted rump's contact plane to the painted deck, independent of alpha margins. */
    riderOffset(model: MemeRunnerModel, riderFrame: string): number {
        const seat = RIDER_SEAT_Y[Number(riderFrame.slice(5))];
        return model.mounted && riderFrame.startsWith('ride-') && seat !== undefined ? CART_DECK_Y - RUNNER.rideHeight - seat : 0;
    }
    private frame(c: RunnerDevice, m: MemeRunnerModel): number {
        if (c.kind === 'launcher') return c.used && c.actionAge < .2 ? 1 : 0;
        if (c.kind === 'cart') return m.mounted === c.id || c.used ? stopMotionFrame(m.time, 2) : 0;
        if (c.kind === 'saw') return stopMotionFrame(c.visibleAge, 2);
        if (c.kind === 'compressor') return compressorPose(c.visibleAge) === 3 ? 1 : 0;
        if (c.kind === 'stomper' || c.kind === 'electric') return stopMotionFrame(c.visibleAge, 2);
        const jump = hopperMotion(c.visibleAge);
        return jump.grounded ? 1 : 0;
    }
    reset(): void { for (const view of Array.from(this.actors.values())) this.destroy(view); this.actors.clear(); }
    dispose(): void { this.reset(); this.pursuer.sprite.spriteFrame = null; this.pursuer.node.destroy(); }
}
