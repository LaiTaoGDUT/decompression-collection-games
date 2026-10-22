import { Button, Color, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';

/** The v38 felt UI palette (visual spec): plum ink on cream felt, teal route, coin gold, fever orange. */
export const RUNNER_UI = {
    ink: '#3A2340', paper: '#FFF6E5', teal: '#3E9C98', gold: '#FFC93C', orange: '#FF8A3D', muted: '#8A6E84', line: '#E3CFAE',
};
export function runnerNode(name: string, parent: Node, w: number, h: number): Node {
    const n = new Node(name); n.layer = parent.layer; n.parent = parent;
    n.addComponent(UITransform).setContentSize(w, h); return n;
}
export function runnerLabel(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number,
    size: number, tint = RUNNER_UI.ink): Label {
    const n = runnerNode(name, parent, w, h); n.setPosition(x, y);
    const l = n.addComponent(Label); l.string = text; l.fontSize = size; l.lineHeight = size + 8;
    l.color = new Color(tint); l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER;
    l.overflow = Label.Overflow.SHRINK; setLabelBold(l, true); return l;
}
/** Bold cream lettering with a plum outline, for numbers that sit straight on the scene. */
export function runnerTitle(name: string, parent: Node, text: string, x: number, y: number, w: number, h: number, size: number,
    tint = RUNNER_UI.paper): Label {
    const l = runnerLabel(name, parent, text, x, y, w, h, size, tint);
    l.enableOutline = true; l.outlineColor = new Color(RUNNER_UI.ink); l.outlineWidth = Math.max(3, Math.round(size / 10)); return l;
}
/** A sprite at its own size or a given one; `sliced` stretches a 9-slice felt piece. */
export function runnerSprite(name: string, parent: Node, frame: SpriteFrame, w: number, h: number, sliced = false): Sprite {
    const s = runnerNode(name, parent, w, h).addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame;
    if (sliced) s.type = Sprite.Type.SLICED;
    return s;
}
/** A stitched felt patch (9-sliced `hud-panel`); a tint dyes the felt, e.g. teal for a primary button. */
export function runnerPlate(parent: Node, name: string, w: number, h: number, frames: Readonly<Record<string, SpriteFrame>>, tint?: string): Node {
    const s = runnerSprite(name, parent, frames['hud-panel'], w, h, true);
    if (tint) s.color = new Color(tint);
    return s.node;
}
export function runnerButton(n: Node, run: () => void): void {
    const b = n.addComponent(Button); b.transition = Button.Transition.SCALE; b.duration = .1; b.zoomScale = .95;
    n.on(Button.EventType.CLICK, run);
}
