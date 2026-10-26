import {
    BlockInputEvents, Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec2,
} from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { SLING_THEME as T, type SlingFrame } from './SlingPuckTheme';

export interface LabelStyle {
    readonly size: number;
    readonly color?: string;
    readonly bold?: boolean;
    /** Dark outline width; 0 disables it. */
    readonly outline?: number;
    readonly outlineColor?: string;
    /** Drop shadow under the glyphs. */
    readonly shadow?: boolean;
    readonly align?: 'left' | 'center' | 'right';
}

export type IconKind = 'pause' | 'back' | 'play' | 'restart' | 'home' | 'robot' | 'users' | 'help' | 'clock' | 'touch' | 'pull' | 'release';

interface Animation { node?: Node; age: number; duration: number; step: (t: number) => void; done?: () => void; dead?: boolean }

export function color(hex: string, alpha = 255): Color { const c = Color.fromHEX(new Color(), hex); c.a = alpha; return c; }
export function easeOutBack(t: number): number { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
export function easeOutCubic(t: number): number { const u = 1 - t; return 1 - u * u * u; }
export function easeInCubic(t: number): number { return t * t * t; }

/**
 * Node, sprite, label and button primitives shared by the rink, HUD and menus, plus a frame-ticked
 * animator. Animations live only in this kit, so disposing the game drops every running motion at once.
 */
export class SlingPuckUi {
    private readonly animations: Animation[] = [];

    constructor(private readonly layer: number, private readonly frames: Readonly<Record<SlingFrame, SpriteFrame>>,
        private readonly tap: () => void, private readonly isLive: () => boolean) {}

    frame(key: SlingFrame): SpriteFrame { return this.frames[key]; }

    make(name: string, parent: Node, width = 0, height = 0): Node {
        const node = new Node(name); node.layer = this.layer; parent.addChild(node);
        node.addComponent(UITransform).setContentSize(width, height); return node;
    }

    sprite(name: string, parent: Node, frame: SlingFrame, width: number, height: number, tint: string = T.white, alpha = 255): Sprite {
        const node = this.make(name, parent, width, height), sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.frames[frame]; sprite.color = color(tint, alpha);
        return sprite;
    }

    label(name: string, parent: Node, text: string, x: number, y: number, width: number, height: number, style: LabelStyle): Label {
        const node = this.make(name, parent, width, height); node.setPosition(x, y);
        const label = node.addComponent(Label);
        label.string = text; label.fontSize = style.size; label.lineHeight = Math.round(style.size * 1.2);
        label.color = color(style.color ?? T.white);
        label.horizontalAlign = style.align === 'left' ? Label.HorizontalAlign.LEFT
            : style.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        setLabelBold(label, style.bold ?? true);
        const outline = style.outline ?? 0;
        if (outline > 0) { label.enableOutline = true; label.outlineColor = color(style.outlineColor ?? T.table); label.outlineWidth = outline; }
        if (style.shadow) { label.enableShadow = true; label.shadowColor = color('#000000', 150); label.shadowOffset = new Vec2(0, -Math.max(2, style.size * .025)); label.shadowBlur = 2; }
        return label;
    }

    opacity(node: Node, value = 255): UIOpacity {
        const component = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        component.opacity = value; return component;
    }

    /** Floating circular control; coral lacquer for the primary action. */
    roundButton(name: string, parent: Node, icon: IconKind, size: number, run: () => void | Promise<void>, primary = false): Node {
        const node = this.make(name, parent, size, size);
        const face = this.make('Face', node, size, size);
        this.sprite('Plate', face, primary ? 'buttonPrimary' : 'buttonRound', size, size);
        const g = this.make('Icon', face, size, size).addComponent(Graphics);
        g.node.setPosition(0, 2);
        this.drawIcon(g, icon, T.ice, size / 88);
        this.bind(node, run, face);
        return node;
    }

    drawIcon(g: Graphics, icon: IconKind, tint: string, scale: number): void {
        g.clear();
        const s = scale;
        g.strokeColor = color(tint); g.fillColor = color(tint); g.lineWidth = 6 * s;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        if (icon === 'pause') {
            g.roundRect(-13 * s, -15 * s, 9 * s, 30 * s, 3 * s); g.roundRect(4 * s, -15 * s, 9 * s, 30 * s, 3 * s); g.fill();
        } else if (icon === 'back') {
            g.moveTo(7 * s, 15 * s); g.lineTo(-8 * s, 0); g.lineTo(7 * s, -15 * s); g.stroke();
        } else if (icon === 'play') {
            g.moveTo(-9 * s, 14 * s); g.lineTo(13 * s, 0); g.lineTo(-9 * s, -14 * s); g.close(); g.fill();
        } else if (icon === 'restart') {
            g.arc(0, 0, 13 * s, Math.PI * .35, Math.PI * 2.05, true); g.stroke();
            g.moveTo(10 * s, 15 * s); g.lineTo(13 * s, 4 * s); g.lineTo(2 * s, 4 * s); g.close(); g.fill();
        } else if (icon === 'touch' || icon === 'pull' || icon === 'release') {
            g.lineWidth=2*s;g.fillColor=color('#EADCC7');g.ellipse(-6*s,-16*s,22*s,9*s);g.fill();
            g.strokeColor=color('#7BABC4');g.ellipse(-6*s,-20*s,27*s,10*s);g.stroke();
            g.strokeColor=color(tint);g.lineWidth=2.5*s;
            g.moveTo(-10*s,-10*s);g.lineTo(0,22*s);g.bezierCurveTo(3*s,29*s,10*s,28*s,9*s,21*s);
            g.lineTo(6*s,8*s);g.bezierCurveTo(12*s,16*s,16*s,11*s,15*s,7*s);
            g.bezierCurveTo(22*s,14*s,25*s,8*s,22*s,3*s);g.bezierCurveTo(29*s,9*s,32*s,3*s,27*s,-3*s);
            g.lineTo(14*s,-21*s);g.bezierCurveTo(6*s,-28*s,-11*s,-20*s,-10*s,-10*s);g.stroke();
            if (icon === 'pull') {g.moveTo(-29*s,13*s);g.lineTo(-29*s,-1*s);g.lineTo(-34*s,4*s);g.moveTo(-29*s,-1*s);g.lineTo(-24*s,4*s);g.stroke();}
            if (icon === 'release') {g.moveTo(-18*s,12*s);g.lineTo(-26*s,18*s);g.moveTo(-10*s,26*s);g.lineTo(-13*s,34*s);g.stroke();}
        } else if (icon === 'robot') {
            g.roundRect(-17*s,-13*s,34*s,27*s,8*s); g.stroke();
            g.moveTo(0,14*s);g.lineTo(0,21*s);g.stroke();g.circle(0,23*s,3*s);g.fill();
            g.circle(-7*s,2*s,3*s);g.circle(7*s,2*s,3*s);g.fill();
        } else if (icon === 'users') {
            for (const x of [-10,10]) {g.circle(x*s,9*s,6*s);g.stroke();g.moveTo((x-9)*s,-14*s);g.bezierCurveTo((x-9)*s,0,(x+9)*s,0,(x+9)*s,-14*s);g.stroke();}
        } else if (icon === 'clock') {
            g.circle(0,0,15*s);g.stroke();g.moveTo(0,9*s);g.lineTo(0,0);g.lineTo(6*s,-3*s);g.stroke();
        } else if (icon === 'help') {
            g.moveTo(-6*s,6*s);g.bezierCurveTo(-6*s,16*s,10*s,16*s,10*s,6*s);g.bezierCurveTo(10*s,1*s,0,1*s,0,-4*s);g.lineTo(0,-6*s);g.stroke();g.circle(0,-12*s,1.8*s);g.fill();
        } else {
            g.moveTo(-15 * s, 0); g.lineTo(0, 13 * s); g.lineTo(15 * s, 0); g.stroke();
            g.moveTo(-10 * s, -3 * s); g.lineTo(-10 * s, -14 * s); g.lineTo(10 * s, -14 * s); g.lineTo(10 * s, -3 * s); g.stroke();
        }
    }

    /** Tap handling with press feedback; the action runs only when the release lands on the button. */
    bind(node: Node, run: () => void | Promise<void>, face?: Node): void {
        node.addComponent(BlockInputEvents);
        const target = face ?? node;
        let pressed = false;
        const restore = () => { target.setPosition(0, 0); target.setScale(1, 1, 1); };
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            event.propagationStopped = true; pressed = true;
            target.setPosition(0, -5); target.setScale(.97, .97, 1);
        });
        node.on(Node.EventType.TOUCH_CANCEL, () => { pressed = false; restore(); });
        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            event.propagationStopped = true; restore();
            if (!pressed || !this.isLive() || !node.activeInHierarchy) return;
            pressed = false;
            if (!node.getComponent(UITransform)!.hitTest(event.getLocation(), event.windowId)) return;
            this.tap();
            const result = run(); if (result) void result.catch(error => console.error('[SlingPuck]', error));
        });
    }

    animate(duration: number, step: (t: number) => void, node?: Node, done?: () => void): void {
        if (node) this.stop(node);
        step(0);
        this.animations.push({ node, age: 0, duration: Math.max(1e-3, duration), step, done });
    }

    stop(node: Node): void {
        for (const a of this.animations) if (a.node === node) a.dead = true;
    }

    tick(dt: number): void {
        const list = this.animations, count = list.length;
        let live = 0;
        for (let i = 0; i < count; i++) {
            const a = list[i];
            if (a.dead || (a.node && !a.node.isValid)) continue;
            a.age += dt;
            const t = Math.min(1, a.age / a.duration);
            a.step(t);
            if (t >= 1) { a.dead = true; a.done?.(); continue; }
            list[live++] = a;
        }
        // Animations started from a callback were appended after the snapshot.
        for (let i = count; i < list.length; i++) if (!list[i].dead) list[live++] = list[i];
        list.length = live;
    }

    clear(): void { this.animations.length = 0; }
}
