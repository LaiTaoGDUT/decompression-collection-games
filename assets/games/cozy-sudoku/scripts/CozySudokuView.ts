import { Camera, Canvas, Color, Component, EventTouch, Graphics, Label, Node, Tween, UITransform, Vec3 } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { COZY_THEME as T } from './CozySudokuTheme';

export function ink(hex: string, alpha = 255): Color {
    const c = new Color(); Color.fromHEX(c, hex); c.a = alpha; return c;
}
export function node(name: string, parent: Node, x = 0, y = 0, width = 1, height = 1): Node {
    // Keep all game UI on its owning Canvas layer. Forcing the global UI_2D
    // layer makes it render/hit-test through the persistent application's
    // camera instead of this scene's camera, whose projection may differ.
    const n = new Node(name); n.layer = parent.layer; n.addComponent(UITransform).setContentSize(width, height);
    parent.addChild(n); n.setPosition(x, y); return n;
}
export function graphics(name: string, parent: Node): Graphics { return node(name, parent).addComponent(Graphics); }
/** Use the owning Canvas camera for both grid taps and horizontal page drags. */
export function touchPoint(target:Node,event:EventTouch):Vec3|undefined {
    let camera:Camera|undefined;
    for(let ancestor:Node|null=target;ancestor;ancestor=ancestor.parent) {
        const candidate=ancestor.getComponent(Canvas)?.cameraComponent;
        if(candidate?.isValid&&candidate.enabledInHierarchy&&(candidate.visibility&target.layer)){camera=candidate;break;}
    }
    if(!camera)return;
    const location=event.getLocation();
    return target.getComponent(UITransform)!.convertToNodeSpaceAR(camera.screenToWorld(new Vec3(location.x,location.y,0)));
}
export function rect(g: Graphics, x: number, y: number, w: number, h: number, fill: string,
    radius = 0, stroke?: string, alpha = 255): void {
    g.fillColor = ink(fill, alpha);
    if (radius) g.roundRect(x - w/2, y - h/2, w, h, radius); else g.rect(x-w/2, y-h/2, w, h);
    g.fill();
    if (stroke) { g.strokeColor = ink(stroke); g.lineWidth = 1.5;
        if (radius) g.roundRect(x-w/2, y-h/2, w, h, radius); else g.rect(x-w/2, y-h/2, w, h); g.stroke(); }
}
export function line(g: Graphics, points: readonly (readonly number[])[], color: string = T.ink, width = 3): void {
    g.strokeColor = ink(color); g.lineWidth = width; g.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(p => g.lineTo(p[0],p[1])); g.stroke();
}
export function circle(g: Graphics, x: number, y: number, r: number, color: string, edge?: string): void {
    g.fillColor = ink(color); g.circle(x,y,r); g.fill();
    if (edge) { g.strokeColor = ink(edge); g.lineWidth = 2; g.circle(x,y,r); g.stroke(); }
}
export function text(parent: Node, name: string, value: string, x: number, y: number,
    size = 24, width = 600, height = 50, color: string = T.ink, bold = false): Label {
    const label = node(name, parent, x,y,width,height).addComponent(Label);
    label.string = value; label.fontSize = size; label.lineHeight = Math.ceil(size*1.35);
    label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK; label.color = ink(color); setLabelBold(label,bold);
    return label;
}
export function destroyTree(root?: Node): void {
    if (!root?.isValid) return;
    const nodes = [root];
    for (let i=0;i<nodes.length;i++) {
        nodes.push(...nodes[i].children); Tween.stopAllByTarget(nodes[i]);
        for(const component of nodes[i].getComponents(Component))Tween.stopAllByTarget(component);
        nodes[i].off(Node.EventType.TOUCH_END);
    }
    root.removeFromParent(); root.destroy();
}
