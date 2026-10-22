import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { bananaMotion, popcatPose, RUNNER, spinnerMotion, type MemeRunnerModel, type RunnerCompanion } from './MemeRunnerModel';
import { bullRunFrame, CAST_RUN_FRAME_COUNT, DRAGON_REACTION_DURATION, dragonReactionFrame, SPINNER_FRAME_COUNT, spinnerTurnFrame } from './MemeRunnerMotion';
import { BULL_BACK_Y, RIDER_SEAT_Y } from './MemeRunnerRideAnchors';

export const CAST_LAYOUT = {
    bull: { width: 208, height: 144, frames: 24 },
    dragon: { width: 224, height: 128, frames: 16 },
    kangaroo: { width: 176, height: 176, frames: 20 },
    spinner: { width: 224, height: 144, frames: SPINNER_FRAME_COUNT },
    popcat: { width: 128, height: 128, frames: 4 },
    banana: { width: 128, height: 128, frames: 20 },
};
export const CAST_FRAME_SOURCES: ReadonlyArray<{ key: string; path: string }> =
    Object.keys(CAST_LAYOUT).reduce<Array<{ key: string; path: string }>>((all, name) => all.concat(
        Array.from({ length: CAST_LAYOUT[name].frames }, (_, i) => ({ name, i }))
        .filter(({ i }) => name !== 'bull' || i < 8 || i >= 16)
        .filter(({ i }) => name !== 'banana' || i < 2 || i >= 16)
        .map(({ i }) => {
            const fresh = name === 'spinner' || name === 'popcat' || name === 'bull' && i < 8;
            return { key: `${name}-${i}`, path: name === 'bull' && i < 8 ? `visual/v34/frames/bull-${i}/spriteFrame` : fresh ? `visual/v33/frames/${name}-${i}/spriteFrame` : `visual/companions/${name}-registered-v26/${name}-${i}` };
        })), []);

interface CastView { node: Node; sprite: Sprite; opacity: UIOpacity; frame: string; }

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
        return { node, sprite, opacity, frame: '' };
    }
    private setFrame(view: CastView, key: string): void {
        if (view.frame === key) return;
        view.frame = key; view.sprite.spriteFrame = this.frames[key];
        if (key.startsWith('banana-')) {
            const drawing = Number(key.slice(7)), size = drawing >= 4 && drawing < 12 ? 144 : 128;
            view.node.getComponent(UITransform)!.setContentSize(size, size);
        }
    }
    update(model: MemeRunnerModel, heroX: number, floor: number, left: number, right: number, endingAge = 0, entry?: { pursuerX: number; stride: number }, strideOffset = 0): void {
        const present = new Set<number>();
        for (const c of model.companions) {
            const x = heroX + c.x + c.width / 2 + c.offset - model.x;
            if (!c.active || x < left - 150 || x > right + 150) continue;
            present.add(c.id); let view = this.actors.get(c.id);
            if (!view) { view = this.create(c.kind, `Cast-${c.kind}-${c.id}`); this.actors.set(c.id, view); }
            view.node.setPosition(x, floor + c.y);
            view.opacity.opacity = 255;
            this.setFrame(view, `${c.kind}-${this.frame(c, model)}`);
        }
        for (const [id, view] of Array.from(this.actors.entries())) if (!present.has(id)) { view.sprite.spriteFrame = null; view.node.destroy(); this.actors.delete(id); }
        const offscreen = left - 115, caught = model.ended && !model.delivered;
        const approach = offscreen + (heroX - 155 - offscreen) * model.chase;
        // Caught: the pursuer closes in and grabs. Delivered: it gives up and drops back out of sight.
        const chaseX = entry?.pursuerX ?? (caught ? approach + (heroX - 65 - approach) * Math.min(1, endingAge / .7)
            : model.delivered ? approach - 420 * endingAge : approach);
        this.pursuer.node.setPosition(chaseX, floor);
        this.pursuer.opacity.opacity = model.delivered ? Math.round(255 * Math.max(0, 1 - endingAge / .5)) : 255;
        this.setFrame(this.pursuer, `kangaroo-${caught ? 16 + Math.min(3, Math.floor(endingAge / .15)) : Math.floor((entry?.stride ?? model.x + strideOffset + endingAge * 300) / 14) % CAST_RUN_FRAME_COUNT}`);
    }
    riderOffset(model: MemeRunnerModel, riderFrame: string): number {
        if (!model.mounted) return 0;
        const view = this.actors.get(model.mounted);
        if (!view || !riderFrame.startsWith('extra-')) return 0;
        const bullFrame = Number(view.frame.slice(5)), seat = RIDER_SEAT_Y[Number(riderFrame.slice(6))];
        return seat === undefined ? 0 : BULL_BACK_Y[bullFrame] - seat - RUNNER.rideHeight;
    }
    private frame(c: RunnerCompanion, m: MemeRunnerModel): number {
        if (c.kind === 'dragon') {
            if (c.used && c.actionAge < DRAGON_REACTION_DURATION) return dragonReactionFrame(c.actionAge);
            return Math.floor(Math.max(0, c.used ? c.actionAge - DRAGON_REACTION_DURATION : c.age) * 4) % 4;
        }
        if (c.kind === 'bull') {
            if (m.mounted === c.id && !m.grounded) return m.jumpAge < .1 ? 16 : 17;
            if (m.mounted === c.id && m.landAge < .09) return 18;
            if (m.mounted === c.id && m.breakAge < .15) return 19;
            return m.mounted === c.id ? bullRunFrame(c.stride) : c.used ? bullRunFrame(c.stride) : 20 + Math.floor(c.age * 2) % 4;
        }
        if (c.kind === 'spinner') return spinnerTurnFrame(spinnerMotion(c.visibleAge).progress);
        if (c.kind === 'popcat') return popcatPose(c.visibleAge);
        const jump = bananaMotion(c.visibleAge);
        return jump.grounded ? 19 : jump.jumpAge < .08 ? 16 : jump.vy > 0 ? 17 : 18;
    }
    reset(): void {
        for (const view of Array.from(this.actors.values())) { view.sprite.spriteFrame = null; view.node.destroy(); }
        this.actors.clear();
    }
    dispose(): void { this.reset(); this.pursuer.sprite.spriteFrame = null; this.pursuer.node.destroy(); }
}
