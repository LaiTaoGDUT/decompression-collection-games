import { Color, Graphics, Node, Sprite, SpriteFrame, UIOpacity } from 'cc';
import { runnerLabel, runnerNode as node, runnerSprite, RUNNER_UI as T } from './MemeRunnerUI';
import type { MemeRunnerModel } from './MemeRunnerModel';

interface ControlView { root: Node; face: Node; disc: Sprite; glow: Node; pips: UIOpacity[]; }
const PRESSED = new Color(222, 214, 205, 255), RELEASED = new Color(255, 255, 255, 255);

/** Round felt thumb buttons with fixed touch bounds and two visible jump charges. */
export class MemeRunnerControls {
    readonly slide: ControlView;
    readonly jump: ControlView;
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.slide = this.create(parent, 'SlideControl', -534, false); this.jump = this.create(parent, 'JumpControl', 534, true);
    }
    layout(halfWidth: number, bottom: number): void {
        this.slide.root.setPosition(-halfWidth + 86, bottom + 82);
        this.jump.root.setPosition(halfWidth - 86, bottom + 82);
    }
    render(m: MemeRunnerModel, slideHeld: boolean, jumpHeld: boolean): void {
        this.setPressed(this.slide, slideHeld); this.setPressed(this.jump, jumpHeld);
        // Slightly translucent so the road reads through; Fever flies on its own, so they dim until it lands.
        const idle = m.flying ? 110 : 245;
        this.slide.root.getComponent(UIOpacity)!.opacity = idle; this.jump.root.getComponent(UIOpacity)!.opacity = idle;
        this.slide.glow.active = m.sliding; this.jump.glow.active = !m.grounded && m.jumpAge < .14;
        const remaining = m.grounded ? 2 : Math.max(0, 2 - m.jumps);
        this.jump.pips.forEach((pip, i) => { pip.opacity = i < remaining ? 255 : 60; });
    }
    clearInput(): void { this.setPressed(this.slide, false); this.setPressed(this.jump, false); }
    dispose(): void {
        for (const v of [this.slide, this.jump]) { v.disc.spriteFrame = null; v.root.destroy(); }
    }
    private setPressed(v: ControlView, pressed: boolean): void {
        v.disc.color = pressed ? PRESSED : RELEASED; v.face.setPosition(0, pressed ? -4 : 0);
        const s = pressed ? .96 : 1; v.face.setScale(s, s, 1);
    }
    private create(parent: Node, name: string, x: number, jump: boolean): ControlView {
        const root = node(name, parent, 128, 128); root.setPosition(x, -318); root.addComponent(UIOpacity);
        const face = node('ControlFace', root, 128, 128);
        const disc = runnerSprite('FeltButton', face, this.frames[jump ? 'hud-button-jump' : 'hud-button-slide'], 128, 128);
        const glow = node('ActionGlow', face, 128, 128), ring = glow.addComponent(Graphics);
        ring.strokeColor = new Color(jump ? T.gold : T.teal); ring.lineWidth = 5; ring.circle(0, 0, 62); ring.stroke(); glow.active = false;
        // Two jump charges ride above the button: the ground jump and the air jump.
        const pips: UIOpacity[] = [];
        if (jump) for (let i = 0; i < 2; i++) {
            const pip = node(`JumpCharge-${i}`, root, 16, 16); pip.setPosition((i - .5) * 22, 75);
            const g = pip.addComponent(Graphics); g.fillColor = new Color(T.ink); g.circle(0, 0, 7); g.fill();
            g.fillColor = new Color(T.gold); g.circle(0, 0, 5); g.fill(); pips.push(pip.addComponent(UIOpacity));
        }
        runnerLabel('ActionLabel', face, jump ? '跳跃' : '滑铲', 0, -38, 84, 28, 20, T.ink);
        return { root, face, disc, glow, pips };
    }
}
