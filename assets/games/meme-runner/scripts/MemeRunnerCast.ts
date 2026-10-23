import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { bananaMotion, popcatPose, RUNNER, type MemeRunnerModel, type RunnerCompanion } from './MemeRunnerModel';
import { BULL_RUN_FRAME_COUNT, bullRunFrame, DRAGON_REACTION_DURATION, dragonReactionFrame, KANGAROO_RUN_FRAME_COUNT, SPINNER_FRAME_COUNT, STOP_MOTION_STEP, stopMotionFrame } from './MemeRunnerMotion';
import { BULL_BACK_Y, RIDER_SEAT_Y } from './MemeRunnerRideAnchors';

/** Felt stop-motion drawings. Bull: trot, two idle, air, landing. Dragon: two idle, squash, rebound,
 * two laughs. Kangaroo: hop cycle, lunge, grab. Banana: stand, crouch, rise, fall. Nyan is the flying obstacle. */
export const CAST_LAYOUT = {
    bull: { width: 208, height: 144, frames: BULL_RUN_FRAME_COUNT + 4 },
    dragon: { width: 224, height: 128, frames: 6 },
    kangaroo: { width: 176, height: 176, frames: KANGAROO_RUN_FRAME_COUNT + 2 },
    spinner: { width: 224, height: 144, frames: SPINNER_FRAME_COUNT },
    popcat: { width: 128, height: 128, frames: 4 },
    banana: { width: 128, height: 128, frames: 4 },
    nyan: { width: 176, height: 80, frames: 2 },
};
/** Friends (dragon, bull) carry the teal "land here" pin and ground ring; hazards never do. */
const FRIEND = { pin: [56, 64], ring: [200, 48] };
export const CAST_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> =
    Object.keys(CAST_LAYOUT).reduce<Array<{ key: string; path: string }>>((all, name) => all.concat(
        Array.from({ length: CAST_LAYOUT[name].frames }, (_, i) => ({ key: `${name}-${i}`, path: `visual/v42/frames/${name}-${i}/spriteFrame` }))),
    ['friend-pin', 'friend-ring'].map(key => ({ key, path: `visual/v42/frames/${key}/spriteFrame` })));

interface CastView { node: Node; sprite: Sprite; opacity: UIOpacity; frame: string; pin?: Node; ring?: Node; }

/** Only selects complete painted drawings; physics and animation share the model clock. */
export class MemeRunnerCast {
    readonly actors = new Map<number, CastView>();
    private readonly pursuer: CastView;
    constructor(private readonly parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.pursuer = this.create('kangaroo', 'Pursuer');
    }
    private create(kind: string, name: string): CastView {
        const d = CAST_LAYOUT[kind], node = new Node(name); node.layer = this.parent.layer; node.parent = this.parent;
        const transform = node.addComponent(UITransform); transform.setContentSize(d.width, d.height); transform.setAnchorPoint(.5, 0);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
        const opacity = node.addComponent(UIOpacity);
        if (kind === 'banana') node.setScale(-1, 1, 1);
        if (kind !== 'dragon' && kind !== 'bull') return { node, sprite, opacity, frame: '' };
        // The ring lies under the friend's feet, so it is a sibling drawn first; the pin rides above it.
        const ring = this.marker('FriendRing', this.parent, 'friend-ring', FRIEND.ring); ring.setSiblingIndex(node.getSiblingIndex());
        ring.addComponent(UIOpacity);
        return { node, sprite, opacity, frame: '', pin: this.marker('FriendPin', node, 'friend-pin', FRIEND.pin), ring };
    }
    private marker(name: string, parent: Node, key: string, [w, h]: number[]): Node {
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
    /** `clock` is the presentation's stop-motion clock: it keeps running through the run-in and the ending. */
    update(model: MemeRunnerModel, heroX: number, floor: number, left: number, right: number, clock: number, endingAge = 0, entry?: { pursuerX: number }): void {
        const present = new Set<number>();
        for (const c of model.companions) {
            const x = heroX + c.x + c.width / 2 + c.offset - model.x;
            if (!c.active || x < left - 150 || x > right + 150) continue;
            present.add(c.id); let view = this.actors.get(c.id);
            if (!view) { view = this.create(c.kind, `Cast-${c.kind}-${c.id}`); this.actors.set(c.id, view); }
            view.node.setPosition(x, floor + c.y);
            view.opacity.opacity = 255;
            this.setFrame(view, `${c.kind}-${this.frame(c, model)}`);
            if (view.pin && view.ring) {
                // Only while it can still be used: a ridden or bounced friend, or a bull during Fever, drops the markers.
                const available = !c.used && !model.mounted && (c.kind === 'dragon' || model.feverTime <= 0);
                view.pin.active = view.ring.active = available;
                if (available) {
                    view.pin.setPosition(0, c.height + 52 + 6 * Math.sin(model.time * 5));
                    view.ring.setPosition(x, floor + c.y + 4); view.ring.setScale(c.width * 1.15 / FRIEND.ring[0], 1, 1);
                    view.ring.getComponent(UIOpacity)!.opacity = 190 + Math.round(55 * Math.sin(model.time * 5));
                }
            }
        }
        for (const [id, view] of Array.from(this.actors.entries())) if (!present.has(id)) { this.destroy(view); this.actors.delete(id); }
        const offscreen = left - 115, caught = model.ended && !model.delivered;
        const approach = offscreen + (heroX - 155 - offscreen) * model.chase;
        // Caught: the pursuer closes in and grabs. Delivered: it gives up and drops back out of sight.
        const chaseX = entry?.pursuerX ?? (caught ? approach + (heroX - 65 - approach) * Math.min(1, endingAge / .7)
            : model.delivered ? approach - 420 * endingAge : approach);
        this.pursuer.node.setPosition(chaseX, floor);
        this.pursuer.opacity.opacity = model.delivered ? Math.round(255 * Math.max(0, 1 - endingAge / .5)) : 255;
        this.setFrame(this.pursuer, `kangaroo-${caught ? KANGAROO_RUN_FRAME_COUNT + (endingAge < 2 * STOP_MOTION_STEP ? 0 : 1) : stopMotionFrame(clock, KANGAROO_RUN_FRAME_COUNT)}`);
    }
    riderOffset(model: MemeRunnerModel, riderFrame: string): number {
        if (!model.mounted) return 0;
        const view = this.actors.get(model.mounted);
        if (!view || !riderFrame.startsWith('ride-')) return 0;
        const bullFrame = Number(view.frame.slice(5)), seat = RIDER_SEAT_Y[Number(riderFrame.slice(5))];
        return seat === undefined ? 0 : BULL_BACK_Y[bullFrame] - seat - RUNNER.rideHeight;
    }
    private frame(c: RunnerCompanion, m: MemeRunnerModel): number {
        if (c.kind === 'dragon') {
            if (c.used && c.actionAge < DRAGON_REACTION_DURATION) return dragonReactionFrame(c.actionAge);
            // Idle on its back: a happy face with a short squeezed-eye giggle every second and a half.
            return stopMotionFrame(c.age, 18) === 17 ? 1 : 0;
        }
        if (c.kind === 'bull') {
            const ridden = m.mounted === c.id;
            if (ridden && !m.grounded) return BULL_RUN_FRAME_COUNT + 2;
            if (ridden && (m.landAge < .09 || m.breakAge < .15)) return BULL_RUN_FRAME_COUNT + 3;
            // Waiting, it shifts its weight every half second; ridden or released, it trots on the model clock.
            return ridden || c.used ? bullRunFrame(m.time) : BULL_RUN_FRAME_COUNT + Math.floor(c.age * 2) % 2;
        }
        if (c.kind === 'spinner') return stopMotionFrame(c.visibleAge, SPINNER_FRAME_COUNT);
        if (c.kind === 'popcat') return popcatPose(c.visibleAge);
        const jump = bananaMotion(c.visibleAge);
        return jump.grounded ? 0 : jump.jumpAge < STOP_MOTION_STEP ? 1 : jump.vy > 0 ? 2 : 3;
    }
    reset(): void {
        for (const view of Array.from(this.actors.values())) this.destroy(view);
        this.actors.clear();
    }
    dispose(): void { this.reset(); this.pursuer.sprite.spriteFrame = null; this.pursuer.node.destroy(); }
}
