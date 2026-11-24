import { Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, Vec2 } from 'cc';
import { applyCubeFont } from './CubeAwayTypography';
import { setLabelBold } from '../../../services/font/FontBinding';
import { CUBE_AWAY_THEME } from './CubeAwayTheme';
export const INK = CUBE_AWAY_THEME.ink;
export const MUTED = CUBE_AWAY_THEME.inkMuted;
export const IVORY = CUBE_AWAY_THEME.cardBg;
const CAPSULE_FILLS = {
    primary: CUBE_AWAY_THEME.primaryButton,
    coral: CUBE_AWAY_THEME.coralButton,
    honey: CUBE_AWAY_THEME.honeyButton,
    secondary: CUBE_AWAY_THEME.secondaryButton,
};
export type CapsuleColorVariant = keyof typeof CAPSULE_FILLS;
export function hexColor(hex: string, alpha = 255): Color {
    const n = parseInt(hex.replace('#', ''), 16);
    return new Color(n >> 16 & 255, n >> 8 & 255, n & 255, alpha);
}
export function uiNode(parent: Node, name: string, w = 100, h = 100): Node {
    const n = new Node(name); n.layer = parent.layer; parent.addChild(n);
    n.addComponent(UITransform).setContentSize(w, h); return n;
}
export function textLabel(parent: Node, name: string, text: string, size: number, w = 500, h = size * 1.5, hex: string = INK, bold = true): Label {
    const n = uiNode(parent, name, w, h), l = n.addComponent(Label);
    l.string = text; l.fontSize = size; l.lineHeight = size * 1.3;
    l.color = hexColor(hex); l.horizontalAlign = Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK;
    setLabelBold(l, bold); applyCubeFont(l, bold); return l;
}
export function picture(parent: Node, name: string, frame: SpriteFrame | undefined, w: number, h: number): Node {
    const n = uiNode(parent, name, w, h), sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM; if (frame) sp.spriteFrame = frame;
    n.getComponent(UITransform)!.setContentSize(w, h); return n;
}
/** Movement cancels taps; base scale is preserved for responsive groups. */
export function bindPressFeedback(node: Node, tap: () => void, pressedScale = .97, canTap: () => boolean = () => true): void {
    let pressed = false, moved = false; const start = new Vec2(); const base = node.scale.clone();
    node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
        pressed = true; moved = false; start.set(e.getUILocation());
        node.setScale(base.x * pressedScale, base.y * pressedScale, base.z);
    });
    node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
        if (Vec2.distance(start, e.getUILocation()) > 14) { moved = true; node.setScale(base); }
    });
    node.on(Node.EventType.TOUCH_END, () => {
        node.setScale(base); const fire = pressed && !moved && canTap(); pressed = false;
        if (fire) tap();
    });
    node.on(Node.EventType.TOUCH_CANCEL, () => { pressed = false; node.setScale(base); });
}
export function drawPorcelainCard(parent: Node, name: string, w: number, h: number, r = 48, fill: string = IVORY): Node {
    const n = uiNode(parent, name, w, h), g = n.addComponent(Graphics);
    g.fillColor = hexColor(CUBE_AWAY_THEME.panelShade, 20); g.roundRect(-w / 2, -h / 2 - 4, w, h, r); g.fill();
    g.fillColor = hexColor(fill); g.roundRect(-w / 2, -h / 2, w, h, r); g.fill(); return n;
}
export function drawCapsuleButton(parent: Node, name: string, text: string, w: number, h: number, variant: CapsuleColorVariant, tap: () => void, size = 36): Node {
    const n = uiNode(parent, name, w, h), g = n.addComponent(Graphics);
    const fill = hexColor(CAPSULE_FILLS[variant]);
    g.fillColor = fill; g.roundRect(-w / 2, -h / 2, w, h, h / 2); g.fill();
    if (text) textLabel(n, 'Label', text, size, w - 30, h - 6, variant === 'coral' ? IVORY : INK);
    bindPressFeedback(n, tap); return n;
}
export function icon(parent: Node, name: string, kind: 'gear' | 'back' | 'close' | 'bulb' | 'movie' | 'lock' | 'check', size: number): Node {
    const n = uiNode(parent, name, size, size), g = n.addComponent(Graphics); const k = size / 64;
    g.lineWidth = 4.5 * k; g.strokeColor = hexColor(INK); g.fillColor = hexColor(IVORY);
    g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
    if (kind === 'gear') {
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; const r = (i % 6 < 2 ? 24 : 19) * k;
            if (!i) g.moveTo(Math.cos(a) * r, Math.sin(a) * r); else g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.close(); g.stroke(); g.circle(0, 0, 8 * k); g.stroke();
    } else if (kind === 'back' || kind === 'close' || kind === 'check') {
        if (kind === 'close') g.lineWidth = 7.5 * k;
        const pts = kind === 'back' ? [[18, 0], [-16, 0], [-3, 14], [-16, 0], [-3, -14]] : kind === 'close' ? [[-12, 12], [12, -12], [0, 0], [-12, -12], [12, 12]] : [[-16, 0], [-4, -12], [18, 13]];
        pts.forEach((p, i) => { if (!i) g.moveTo(p[0] * k, p[1] * k); else g.lineTo(p[0] * k, p[1] * k); }); g.stroke();
    } else if (kind === 'bulb') {
        g.fillColor = hexColor('#FFD45E'); g.circle(0, 4 * k, 18 * k); g.fill();
        g.fillColor = hexColor('#FFE38B'); g.ellipse(-6 * k, 12 * k, 7 * k, 4 * k); g.fill();
        g.moveTo(-12 * k, -7 * k); g.lineTo(-9 * k, -20 * k); g.lineTo(9 * k, -20 * k); g.lineTo(12 * k, -7 * k); g.close(); g.fill();
        g.fillColor = hexColor(IVORY); g.roundRect(-9 * k, -27 * k, 18 * k, 10 * k, 4 * k); g.fill();
        g.strokeColor = hexColor('#BA7E2A'); g.lineWidth = 3 * k;
        for (let i = 0; i < 5; i++) { const a = i * Math.PI / 4; g.moveTo(Math.cos(a) * 25 * k, 4 * k + Math.sin(a) * 25 * k); g.lineTo(Math.cos(a) * 30 * k, 4 * k + Math.sin(a) * 30 * k); } g.stroke();
    } else if (kind === 'lock') {
        g.fillColor = hexColor(MUTED); g.roundRect(-10 * k, -14 * k, 20 * k, 20 * k, 3 * k); g.fill();
        g.strokeColor = hexColor(MUTED); g.arc(0, 6 * k, 7 * k, 0, Math.PI, false); g.stroke();
        g.fillColor = hexColor(IVORY); g.circle(0, -3 * k, 2.5 * k); g.fill();
    } else if (kind === 'movie') {
        g.fillColor = hexColor(IVORY);
        g.roundRect(-25 * k, -18.5 * k, 50 * k, 37 * k, 7 * k);
        g.fill();
        g.fillColor = hexColor(CUBE_AWAY_THEME.coralButton);
        g.moveTo(-6 * k, 7 * k);
        g.quadraticCurveTo(-6 * k, 10 * k, -3 * k, 8 * k);
        g.lineTo(6 * k, 2 * k);
        g.quadraticCurveTo(9 * k, 0, 6 * k, -2 * k);
        g.lineTo(-3 * k, -8 * k);
        g.quadraticCurveTo(-6 * k, -10 * k, -6 * k, -7 * k);
        g.close();
        g.fill();
        for (const x of [-21, 14]) {
            for (const y of [-11, 0, 11]) {
                g.roundRect(x * k, (y - 3) * k, 5.5 * k, 6 * k, 1.5 * k);
                g.fill();
            }
        }
    }
    return n;
}
export function heart(parent: Node, name: string, full: boolean, size = 42, fill = '#FF8A79'): Node {
    const n = uiNode(parent, name, size, size), g = n.addComponent(Graphics), s = size / 40;
    g.fillColor = hexColor(fill); g.strokeColor = hexColor('#C99D87'); g.lineWidth = 2.5;
    g.moveTo(0, -17 * s); g.bezierCurveTo(-36 * s, 5 * s, -12 * s, 30 * s, 0, 14 * s);
    g.bezierCurveTo(12 * s, 30 * s, 36 * s, 5 * s, 0, -17 * s); g.close(); if (full) g.fill(); else g.stroke(); return n;
}
export function snakePortrait(parent: Node, frame: SpriteFrame, size: number): Node {
    // The atlas frame includes eight transparent pixels on either side.
    const { width, height } = frame.rect;
    const scale = size / (width - 16);
    return picture(parent, 'SnakePortrait', frame, width * scale, height * scale);
}

export function rewardBulb(parent: Node): Node {
    const bulb = uiNode(parent, 'DailyHintBulb', 192, 208);
    const g = bulb.addComponent(Graphics);
    g.fillColor = hexColor('#FFD96B');
    g.moveTo(-27, -42);
    g.bezierCurveTo(-31, -27, -66, -20, -66, 28);
    g.bezierCurveTo(-66, 65, -36, 92, 0, 92);
    g.bezierCurveTo(36, 92, 66, 65, 66, 28);
    g.bezierCurveTo(66, -20, 31, -27, 27, -42);
    g.close();
    g.fill();
    g.fillColor = hexColor('#FFE79A');
    g.moveTo(-53, 52);
    g.bezierCurveTo(-48, 72, -18, 86, -9, 75);
    g.bezierCurveTo(-4, 63, -30, 64, -42, 47);
    g.bezierCurveTo(-49, 37, -57, 42, -53, 52);
    g.fill();
    g.fillColor = hexColor('#ECDAB0');
    g.roundRect(-16, -84, 32, 20, 10);
    g.fill();
    g.fillColor = hexColor('#F5E8C8');
    g.roundRect(-25, -74, 50, 18, 8);
    g.fill();
    g.fillColor = hexColor(IVORY);
    g.roundRect(-31, -57, 62, 17, 7);
    g.fill();

    g.fillColor = hexColor('#70B86E');
    g.moveTo(32, -68);
    g.quadraticCurveTo(39, -39, 78, -45);
    g.quadraticCurveTo(73, -73, 32, -68);
    g.fill();
    g.fillColor = hexColor('#69AE67');
    g.moveTo(33, -67);
    g.quadraticCurveTo(15, -53, 26, -39);
    g.quadraticCurveTo(43, -50, 33, -67);
    g.fill();
    g.strokeColor = hexColor('#51A15B');
    g.lineWidth = 4;
    g.lineCap = Graphics.LineCap.ROUND;
    g.moveTo(22, -82);
    g.quadraticCurveTo(29, -62, 63, -52);
    g.stroke();
    return bulb;
}

export function drawRewardBackdrop(g: Graphics): void {
    for (let i = 0; i < 22; i++) {
        const radius = 155 - i * 5.4;
        g.fillColor = hexColor('#FFE99D', 3 + Math.floor(i * .65));
        g.ellipse(0, 16, radius * 1.05, radius);
        g.fill();
    }

    const stars = [
        { x: -95, y: 80, size: 13, color: '#F4B2B0' },
        { x: 88, y: 85, size: 13, color: '#F8D574' },
        { x: -96, y: -49, size: 12, color: '#B3DEA9' },
        { x: 96, y: -34, size: 14, color: '#DDB2DA' },
    ];
    for (const { x, y, size, color } of stars) {
        g.fillColor = hexColor(color);
        g.moveTo(x, y + size);
        g.quadraticCurveTo(x + size * .22, y + size * .22, x + size, y);
        g.quadraticCurveTo(x + size * .22, y - size * .22, x, y - size);
        g.quadraticCurveTo(x - size * .22, y - size * .22, x - size, y);
        g.quadraticCurveTo(x - size * .22, y + size * .22, x, y + size);
        g.close();
        g.fill();
    }
}
