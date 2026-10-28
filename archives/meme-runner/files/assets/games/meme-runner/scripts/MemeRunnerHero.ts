import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerMotion } from './MemeRunnerMotion';
import { GIANT } from './MemeRunnerModel';
import { MemeRunnerRig } from './MemeRunnerRig';

/** Continuous locomotion and painted special poses share the model's sole origin. */
export class MemeRunnerHero {
    readonly root: Node;
    private readonly sprite: Sprite;
    private readonly dashAura: Sprite;
    private readonly opacity: UIOpacity;
    private currentFrame = '';
    private readonly rig: MemeRunnerRig;
    private readonly rigOpacity: UIOpacity;

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('RunnerHero'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform).setContentSize(160, 144);
        this.rig = new MemeRunnerRig(this.root, frames);
        this.rigOpacity = this.rig.root.addComponent(UIOpacity);
        const drawing = new Node('WholeCharacterFrame'); drawing.layer = parent.layer; drawing.parent = this.root;
        const transform = drawing.addComponent(UITransform);
        transform.setContentSize(160, 144); transform.setAnchorPoint(.5, 0);
        this.opacity = drawing.addComponent(UIOpacity);
        this.sprite = drawing.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM; this.sprite.trim = false;
        // Aura sits above the complete character drawing during flight.
        const aura = new Node('DashAura'); aura.layer = parent.layer; aura.parent = this.root;
        aura.addComponent(UITransform).setContentSize(384, 256); aura.setPosition(0, 72);
        aura.addComponent(UIOpacity).opacity = 128;
        this.dashAura = aura.addComponent(Sprite);
        this.dashAura.sizeMode = Sprite.SizeMode.CUSTOM; this.dashAura.trim = false; aura.active = false;
    }

    render(motion: MemeRunnerMotion, x: number, y: number, alpha: number, giant = false): void {
        const dashing = motion.frame.startsWith('dash-');
        const articulated = /^(run-|air-|double-|land-)/.test(motion.frame);
        this.root.setPosition(x, y); this.opacity.opacity = dashing ? 255 : alpha;
        this.rig.root.active = articulated; this.sprite.node.active = !articulated; this.rigOpacity.opacity = alpha;
        if (articulated) this.rig.render(motion);
        // Measured painted sole offsets; riding uses its separate seat contact plane.
        const footInset = motion.frame === 'hurt' || motion.frame === 'lose-1' ? 2 : 3;
        this.sprite.node.setPosition(0, motion.grounded && !dashing && !motion.frame.startsWith('ride-') ? -footInset : 0);
        const scale = giant && !dashing ? GIANT.scale : 1;
        this.root.setScale(scale, scale, 1);
        // The four-drawing aura flickers on the same stop-motion clock as the two-pose flight.
        this.dashAura.node.active = dashing;
        this.dashAura.spriteFrame = dashing ? this.frames[`dash-aura-${motion.loop(4)}`] : null;
        if (articulated || this.currentFrame === motion.frame) return;
        this.sprite.node.getComponent(UITransform)!.setContentSize(dashing ? 208 : 160, 144);
        this.currentFrame = motion.frame; this.sprite.spriteFrame = this.frames[motion.frame];
    }

    dispose(): void { this.rig.dispose(); this.sprite.spriteFrame = this.dashAura.spriteFrame = null; this.root.destroy(); }
}
