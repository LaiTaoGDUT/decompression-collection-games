import { Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerMotion } from './MemeRunnerMotion';

/** One complete painted pose per frame, sharing a fixed canvas and ground origin. */
export class MemeRunnerHero {
    readonly root: Node;
    private readonly sprite: Sprite;
    private readonly dashAura: Sprite;
    private readonly opacity: UIOpacity;
    private currentFrame = '';

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('RunnerHero'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform).setContentSize(160, 144);
        const drawing = new Node('WholeCharacterFrame'); drawing.layer = parent.layer; drawing.parent = this.root;
        const transform = drawing.addComponent(UITransform);
        transform.setContentSize(160, 144); transform.setAnchorPoint(.5, 0);
        this.opacity = drawing.addComponent(UIOpacity);
        this.sprite = drawing.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM; this.sprite.trim = false;
        // The foreground shell owns its alpha; the character remains fully opaque beneath it.
        const aura = new Node('DashAura'); aura.layer = parent.layer; aura.parent = this.root;
        aura.addComponent(UITransform).setContentSize(384, 256); aura.setPosition(0, 72);
        aura.addComponent(UIOpacity).opacity = 128;
        this.dashAura = aura.addComponent(Sprite);
        this.dashAura.sizeMode = Sprite.SizeMode.CUSTOM; this.dashAura.trim = false; aura.active = false;
    }

    render(motion: MemeRunnerMotion, x: number, y: number, alpha: number): void {
        const dashing = motion.frame.startsWith('dash-');
        this.root.setPosition(x, y); this.opacity.opacity = dashing ? 255 : alpha;
        // The four-drawing aura flickers on the same stop-motion clock as the two-pose flight.
        this.dashAura.node.active = dashing;
        this.dashAura.spriteFrame = dashing ? this.frames[`dash-aura-${motion.loop(4)}`] : null;
        if (this.currentFrame === motion.frame) return;
        this.sprite.node.getComponent(UITransform)!.setContentSize(dashing ? 208 : 160, 144);
        this.currentFrame = motion.frame; this.sprite.spriteFrame = this.frames[motion.frame];
    }

    dispose(): void { this.sprite.spriteFrame = this.dashAura.spriteFrame = null; this.root.destroy(); }
}
