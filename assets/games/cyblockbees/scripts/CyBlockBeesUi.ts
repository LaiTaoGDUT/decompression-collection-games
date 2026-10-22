import { Color, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, Vec2 } from 'cc';
import { setLabelBold } from '../../../services/font/FontBinding';
import { CYBLOCKBEES_PALETTE as P } from './CyBlockBeesTheme';

export { CYBLOCKBEES_STAR_THRESHOLDS, cyblockbeesStars } from './CyBlockBeesProgress';

export type BeeIcon = 'back' | 'next' | 'play' | 'pause' | 'retry' | 'levels' | 'home' | 'lock' | 'pencil' | 'stopwatch' | 'check' | 'close';

/** 贴纸配色：卡面、厚度、描边。 */
export interface StickerStyle {
    readonly fill: Color;
    readonly base: Color;
    readonly outline?: Color;
}

export type StickerTone = 'honey' | 'cream' | 'mint' | 'danger';

export const CYBLOCKBEES_STICKERS: Readonly<Record<StickerTone, StickerStyle>> = Object.freeze({
    honey: Object.freeze({ fill: P.honey, base: P.honeyDeep, outline: P.outline }),
    cream: Object.freeze({ fill: P.cream, base: P.creamDeep, outline: P.outline }),
    mint: Object.freeze({ fill: P.mint, base: P.mintDeep, outline: P.locked }),
    danger: Object.freeze({ fill: P.danger, base: P.dangerDeep, outline: P.outline }),
});

/** 贴纸描边宽度（设计像素）。 */
const OUTLINE = 4;
/** 按钮按下后拖动超过此距离（设计像素）即取消点击。 */
const DRAG_CANCEL = 24;

export interface LabelOptions {
    readonly color?: Color;
    readonly width?: number;
    readonly bold?: boolean;
    /** 描边色；用于压在天空或彩色底上的标题。 */
    readonly stroke?: Color;
    readonly strokeWidth?: number;
    readonly align?: 'left' | 'center' | 'right';
}

export interface ButtonOptions {
    readonly text?: string;
    readonly icon?: BeeIcon;
    readonly tone?: StickerTone;
    readonly disabled?: boolean;
    readonly textSize?: number;
    readonly depth?: number;
}

/**
 * 本游戏独立的「厚贴纸」控件。所有尺寸是 Fit Width 后的设计像素；
 * 节点的 UITransform 只覆盖卡面和厚度，描边向内绘制，不越出节点范围。
 */
export class CyBlockBeesUi {
    constructor(private readonly frameOf: (slug: string) => SpriteFrame | undefined,
        private readonly click: () => void) {}

    node(parent: Node, name: string, x = 0, y = 0, width = 0, height = 0): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent);
        node.setPosition(x, y); node.addComponent(UITransform).setContentSize(width, height); return node;
    }

    label(parent: Node, text: string, x: number, y: number, size: number, options: LabelOptions = {}): Label {
        const stroke = options.stroke ? options.strokeWidth ?? Math.max(2, Math.round(size / 10)) : 0;
        const node = this.node(parent, 'label', x, y, options.width ?? 580, size * 1.3 + stroke * 2);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size;
        label.lineHeight = size * 1.25; label.color = options.color ?? P.text;
        setLabelBold(label, options.bold ?? false);
        label.horizontalAlign = options.align === 'left' ? Label.HorizontalAlign.LEFT
            : options.align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        if (options.stroke) { label.enableOutline = true; label.outlineColor = options.stroke; label.outlineWidth = stroke; }
        return label;
    }

    /** 圆角贴纸卡片：节点高度包含底部厚度，卡面位于厚度之上。 */
    card(parent: Node, name: string, x: number, y: number, width: number, height: number,
        style: StickerStyle = CYBLOCKBEES_STICKERS.cream, radius = 26, depth = 8): Node {
        const node = this.node(parent, name, x, y, width, height);
        this.paintCard(node.addComponent(Graphics), width, height, style, radius, depth);
        return node;
    }

    paintCard(g: Graphics, width: number, height: number, style: StickerStyle, radius: number, depth: number): void {
        const left = -width / 2, bottom = -height / 2, inset = style.outline ? OUTLINE / 2 : 0;
        const r = Math.max(0, Math.min(radius, (height - depth) / 2, width / 2) - inset);
        g.clear(); g.lineWidth = OUTLINE; g.lineJoin = Graphics.LineJoin.ROUND;
        if (style.outline) g.strokeColor = style.outline;
        if (depth > 0) {
            g.fillColor = style.base;
            g.roundRect(left + inset, bottom + inset, width - inset * 2, height - inset * 2, r); g.fill();
            if (style.outline) g.stroke();
        }
        g.fillColor = style.fill;
        g.roundRect(left + inset, bottom + depth + inset, width - inset * 2, height - depth - inset * 2, r); g.fill();
        if (style.outline) g.stroke();
        // 卡面顶部的柔光条，让贴纸有一点厚度感。
        const shine = Math.min(10, (height - depth) * .12);
        if (shine >= 3 && width > r * 2 + 24) {
            g.fillColor = new Color(255, 255, 255, 70);
            g.roundRect(left + r * .7 + 8, height / 2 - inset - shine - 7, width - r * 1.4 - 16, shine, shine / 2); g.fill();
        }
    }

    /** 尖顶六边形贴纸；radius 为中心到顶点距离，节点高度包含厚度。 */
    hex(parent: Node, name: string, x: number, y: number, radius: number, style: StickerStyle, depth = 8): Node {
        const width = Math.sqrt(3) * radius, node = this.node(parent, name, x, y, width, radius * 2 + depth);
        const g = node.addComponent(Graphics), inset = style.outline ? OUTLINE / 2 : 0, r = radius - inset;
        const shape = (cy: number): void => {
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 2 + i * Math.PI / 3;
                // 顶点稍微内收成圆角，避免六边形尖角发硬。
                const ax = Math.cos(angle - .1) * r * .97, ay = cy + Math.sin(angle - .1) * r * .97;
                const bx = Math.cos(angle + .1) * r * .97, by = cy + Math.sin(angle + .1) * r * .97;
                if (i === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
                g.quadraticCurveTo(Math.cos(angle) * r, cy + Math.sin(angle) * r, bx, by);
            }
            g.close();
        };
        g.lineWidth = OUTLINE; g.lineJoin = Graphics.LineJoin.ROUND;
        if (style.outline) g.strokeColor = style.outline;
        const top = depth / 2;
        if (depth > 0) { g.fillColor = style.base; shape(top - depth); g.fill(); if (style.outline) g.stroke(); }
        g.fillColor = style.fill; shape(top); g.fill(); if (style.outline) g.stroke();
        g.fillColor = new Color(255, 255, 255, 64);
        g.ellipse(0, top + r * .58, r * .42, r * .1); g.fill();
        return node;
    }

    /** 贴纸按钮：tone 决定配色；禁用时退为薄荷色且不响应。 */
    button(parent: Node, name: string, x: number, y: number, width: number, height: number,
        action: () => void, options: ButtonOptions = {}): Node {
        const style = CYBLOCKBEES_STICKERS[options.disabled ? 'mint' : options.tone ?? 'cream'];
        const depth = options.depth ?? Math.max(6, Math.round(height * .1));
        const node = this.card(parent, name, x, y, width, height, style, Math.min(28, (height - depth) / 2), depth);
        const color = options.disabled ? P.locked : options.tone === 'danger' ? P.white : P.text;
        const face = depth / 2, size = options.textSize ?? Math.min(32, Math.round(height * .36));
        if (options.icon) this.icon(node, options.icon, options.text ? -width / 2 + height * .5 : 0, face,
            options.text ? Math.min(30, height * .4) : Math.min(38, height * .46), color);
        if (options.text) this.label(node, options.text, options.icon ? height * .25 : 0, face, size,
            { color, width: width - (options.icon ? height : 28), bold: true });
        this.bindButton(node, action, !options.disabled); return node;
    }

    /**
     * 按下缩小、松开触发；手指拖出超过 DRAG_CANCEL 设计像素即取消本次点击，
     * 这样放在可滑动区域里的按钮不会被滑动误触。
     */
    bindButton(node: Node, action: () => void, enabled = true): void {
        let pointer: number | undefined;
        let cancelled = false;
        const start = new Vec2();
        const stop = (event?: EventTouch): void => { if (event) event.propagationStopped = true; };
        node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            stop(event); if (!enabled || pointer !== undefined) return;
            pointer = event.getID(); cancelled = false; event.getUILocation(start); node.setScale(.94, .94, 1);
        });
        node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            stop(event);
            if (pointer === undefined || event.getID() !== pointer || cancelled) return;
            if (Vec2.distance(event.getUILocation(), start) > DRAG_CANCEL) { cancelled = true; node.setScale(1, 1, 1); }
        });
        node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            stop(event); if (pointer !== undefined && event.getID() !== pointer) return;
            pointer = undefined; cancelled = false; node.setScale(1, 1, 1);
        });
        node.on(Node.EventType.TOUCH_END, (event?: EventTouch) => {
            stop(event); if (event && pointer !== undefined && event.getID() !== pointer) return;
            const dragged = cancelled;
            pointer = undefined; cancelled = false; node.setScale(1, 1, 1);
            if (enabled && !dragged) { this.click(); action(); }
        });
    }

    image(parent: Node, slug: string, x: number, y: number, width: number, height?: number, alpha = 255): Node {
        const frame = this.frameOf(slug);
        const ratio = frame ? frame.originalSize.height / frame.originalSize.width : 1;
        const node = this.node(parent, slug, x, y, width, height ?? width * ratio);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame ?? null; sprite.color = new Color(255, 255, 255, alpha); return node;
    }

    /** 横向缎带标题；两端折角使用更深的同色。 */
    ribbon(parent: Node, text: string, x: number, y: number, width: number, style: StickerStyle): Node {
        const node = this.node(parent, 'ribbon', x, y, width + 64, 76);
        const g = node.addComponent(Graphics), half = width / 2, tail = 32;
        g.lineWidth = OUTLINE; g.lineJoin = Graphics.LineJoin.ROUND; g.strokeColor = P.outline;
        // 折角在缎带后方、略低一些，形成前后两层。
        g.fillColor = style.base;
        for (const sign of [-1, 1]) {
            g.moveTo(sign * (half - 24), 12); g.lineTo(sign * (half + tail), 12);
            g.lineTo(sign * (half + tail - 14), -7); g.lineTo(sign * (half + tail), -26);
            g.lineTo(sign * (half - 24), -26); g.close(); g.fill(); g.stroke();
        }
        g.fillColor = style.fill;
        g.roundRect(-half, -20, width, 52, 14); g.fill(); g.stroke();
        g.fillColor = new Color(255, 255, 255, 70);
        g.roundRect(-half + 18, 20, width - 36, 6, 3); g.fill();
        this.label(node, text, 0, 6, 34, { color: P.white, width: width - 40, bold: true, stroke: P.outline, strokeWidth: 4 });
        return node;
    }

    /** 横向进度条：深色槽 + 填充，ratio ∈ [0, 1]。 */
    paintBar(g: Graphics, x: number, y: number, width: number, height: number, ratio: number, fill: Color): void {
        const r = height / 2;
        g.lineWidth = 3; g.strokeColor = P.outline; g.fillColor = P.creamDeep;
        g.roundRect(x, y - r, width, height, r); g.fill();
        const filled = Math.max(0, Math.min(1, ratio)) * width;
        if (filled > 1) {
            g.fillColor = fill; g.roundRect(x, y - r, Math.max(filled, Math.min(height, width)), height, r); g.fill();
            g.fillColor = new Color(255, 255, 255, 90);
            if (filled > height) { g.roundRect(x + r * .6, y + r * .1, filled - r * 1.2, r * .5, r * .25); g.fill(); }
        }
        g.roundRect(x, y - r, width, height, r); g.stroke();
    }

    /**
     * 铅笔形墨水条：左端橡皮 + 金属箍，蜂蜜色笔杆按剩余比例缩短，笔尖（木锥 + 笔芯）跟着笔杆末端移动。
     * 背后的浅色胶囊是满墨时的长度。left 为整支铅笔左端，length 为满墨总长。
     */
    paintPencilMeter(g: Graphics, left: number, length: number, height: number, ratio: number, low: boolean): void {
        const h = height / 2, eraser = 24, band = 10, cone = 30, lead = 9;
        const bodyMax = length - eraser - band - cone, body = bodyMax * Math.max(0, Math.min(1, ratio));
        g.lineJoin = Graphics.LineJoin.ROUND; g.lineCap = Graphics.LineCap.ROUND;
        // 满墨长度的浅色槽。
        g.lineWidth = 2.5; g.fillColor = new Color(255, 255, 255, 110); g.strokeColor = new Color(96, 58, 32, 110);
        g.roundRect(left, -h, length, height, h); g.fill(); g.stroke();
        g.lineWidth = 3; g.strokeColor = P.outline;
        // 橡皮 + 金属箍。
        g.fillColor = new Color(244, 150, 160, 255);
        g.roundRect(left, -h, eraser + 8, height, Math.min(h, 10)); g.fill(); g.stroke();
        const bandLeft = left + eraser;
        g.fillColor = new Color(186, 196, 210, 255); g.rect(bandLeft, -h, band, height); g.fill(); g.stroke();
        // 笔杆：蜂蜜色，低墨时转红；上沿一条亮色、中间一条深色棱线。
        const bodyLeft = bandLeft + band;
        if (body > .5) {
            g.fillColor = low ? P.danger : P.honey; g.rect(bodyLeft, -h, body, height); g.fill();
            g.fillColor = low ? new Color(246, 150, 132, 255) : P.honeyLight; g.rect(bodyLeft, h * .35, body, h * .45); g.fill();
            g.fillColor = low ? P.dangerDeep : P.honeyDeep; g.rect(bodyLeft, -h * .2, body, 2.5); g.fill();
            g.rect(bodyLeft, -h, body, height); g.stroke();
        }
        // 木锥 + 笔芯。
        const tipLeft = bodyLeft + body;
        g.fillColor = new Color(250, 218, 166, 255);
        g.moveTo(tipLeft, -h); g.lineTo(tipLeft + cone, 0); g.lineTo(tipLeft, h); g.close(); g.fill(); g.stroke();
        g.fillColor = P.outline;
        g.moveTo(tipLeft + cone - lead, -h * lead / cone); g.lineTo(tipLeft + cone, 0);
        g.lineTo(tipLeft + cone - lead, h * lead / cone); g.close(); g.fill();
    }

    /** 圆形秒表：顶部按钮 + 表盘 + 倒计时圆环，ratio ∈ [0, 1]。 */
    paintStopwatch(g: Graphics, radius: number, ratio: number, danger: boolean): void {
        this.paintStopwatchFace(g, radius, danger);
        this.paintStopwatchProgress(g, radius, ratio, danger);
    }

    /** 表盘和空圆环只在初建或危险配色切换时重画。 */
    paintStopwatchFace(g: Graphics, radius: number, danger: boolean): void {
        g.lineJoin = Graphics.LineJoin.ROUND; g.lineWidth = 4; g.strokeColor = P.outline;
        g.fillColor = danger ? P.danger : P.honey;
        g.roundRect(-radius * .22, radius * .86, radius * .44, radius * .3, 3); g.fill(); g.stroke();
        g.fillColor = danger ? new Color(255, 232, 224, 255) : P.cream;
        g.circle(0, 0, radius); g.fill(); g.stroke();
        const ring = radius * .74;
        g.lineWidth = radius * .2; g.lineCap = Graphics.LineCap.ROUND;
        g.strokeColor = P.creamDeep; g.circle(0, 0, ring); g.stroke();
    }

    /** 把进度量化到圆弧长度约 1 设计像素的台阶；进度层只在弧长可见变化时重建网格。 */
    stopwatchProgressRatio(radius: number, ratio: number): number {
        const steps = Math.ceil(Math.PI * 2 * radius * .74);
        return Math.ceil(Math.max(0, Math.min(1, ratio)) * steps) / steps;
    }

    /** 独立进度层只在量化后的进度变化时生成圆弧。 */
    paintStopwatchProgress(g: Graphics, radius: number, ratio: number, danger: boolean): void {
        const ring = radius * .74;
        g.lineWidth = radius * .2; g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        if (ratio > .001) {
            g.strokeColor = danger ? P.danger : P.honey;
            g.arc(0, 0, ring, Math.PI / 2, Math.PI / 2 - Math.PI * 2 * Math.min(1, ratio), false); g.stroke();
        }
    }

    star(parent: Node, x: number, y: number, radius: number, active: boolean): Graphics {
        const g = this.node(parent, 'star', x, y, radius * 2.3, radius * 2.3).addComponent(Graphics);
        this.paintStar(g, radius, active); return g;
    }

    paintStar(g: Graphics, radius: number, active: boolean): void {
        const point = (i: number, r: number): [number, number] => {
            const angle = Math.PI / 2 + i * Math.PI / 5; return [Math.cos(angle) * r, Math.sin(angle) * r - radius * .04];
        };
        const path = (r: number): void => {
            for (let i = 0; i < 10; i++) {
                const [x, y] = point(i, i % 2 ? r * .5 : r);
                if (!i) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.close();
        };
        g.clear(); g.lineJoin = Graphics.LineJoin.ROUND; g.lineWidth = Math.max(2, radius * .2);
        g.strokeColor = active ? P.outline : P.honeyDeep;
        g.fillColor = active ? P.honey : P.creamDeep; path(radius); g.fill(); g.stroke();
        if (active && radius >= 10) {
            g.fillColor = P.honeyLight; path(radius * .5); g.fill();
        }
    }

    icon(parent: Node, icon: BeeIcon, x: number, y: number, size: number, color: Color = P.text): Node {
        const node = this.node(parent, icon, x, y, size * 1.2, size * 1.2), g = node.addComponent(Graphics);
        g.strokeColor = color; g.fillColor = color; g.lineWidth = size * .14;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
        const line = (points: number[]): void => {
            g.moveTo(points[0] * size, points[1] * size);
            for (let i = 2; i < points.length; i += 2) g.lineTo(points[i] * size, points[i + 1] * size); g.stroke();
        };
        if (icon === 'back' || icon === 'next') {
            const sign = icon === 'back' ? 1 : -1; line([.12 * sign, .34, -.2 * sign, 0, .12 * sign, -.34]);
        } else if (icon === 'play') {
            g.moveTo(-size * .2, size * .34); g.lineTo(size * .34, 0); g.lineTo(-size * .2, -size * .34); g.close();
            g.fill(); g.stroke();
        } else if (icon === 'pause') {
            g.roundRect(-size * .3, -size * .36, size * .2, size * .72, size * .07);
            g.roundRect(size * .1, -size * .36, size * .2, size * .72, size * .07); g.fill();
        } else if (icon === 'retry') {
            // 顺着角度递增方向画 300° 圆弧，缺口在右上，箭头落在弧的末端。
            const r = size * .32, start = Math.PI * .5, end = Math.PI * 2.15;
            g.moveTo(Math.cos(start) * r, Math.sin(start) * r);
            g.arc(0, 0, r, start, end, true); g.stroke();
            const ex = Math.cos(end) * r, ey = Math.sin(end) * r, tx = -Math.sin(end), ty = Math.cos(end);
            const nx = Math.cos(end), ny = Math.sin(end), head = size * .17;
            g.moveTo(ex + tx * head * 1.2, ey + ty * head * 1.2);
            g.lineTo(ex + nx * head - tx * head * .3, ey + ny * head - ty * head * .3);
            g.lineTo(ex - nx * head - tx * head * .3, ey - ny * head - ty * head * .3);
            g.close(); g.fill(); g.stroke();
        } else if (icon === 'levels') {
            for (const xx of [-.34, .06]) for (const yy of [-.34, .06]) {
                g.roundRect(size * xx, size * yy, size * .28, size * .28, size * .08); g.fill();
            }
        } else if (icon === 'home') {
            line([-.44, .02, 0, .4, .44, .02]); line([-.3, .12, -.3, -.36, .3, -.36, .3, .12]);
            g.roundRect(-size * .09, -size * .36, size * .18, size * .24, size * .04); g.fill();
        } else if (icon === 'lock') {
            g.roundRect(-size * .32, -size * .4, size * .64, size * .48, size * .1); g.fill();
            g.arc(0, size * .08, size * .2, 0, Math.PI, true); g.stroke();
        } else if (icon === 'pencil') {
            // 贴纸铅笔：蜂蜜色笔杆、奶油色木头笔尖、深色笔芯，斜 45°。
            const k = size / 2, c = Math.SQRT1_2;
            const at = (u: number, v: number): [number, number] => [(u - v) * c * k, (u + v) * c * k];
            const poly = (points: number[][], fill: Color): void => {
                points.forEach(([u, v], i) => { const [px, py] = at(u, v); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
                g.close(); g.fillColor = fill; g.fill(); g.stroke();
            };
            g.strokeColor = P.outline; g.lineWidth = Math.max(2.5, size * .09);
            poly([[-.95, -.3], [.45, -.3], [.45, .3], [-.95, .3]], P.honey);
            poly([[.45, -.3], [.95, 0], [.45, .3]], P.cream);
            poly([[.78, -.1], [.98, 0], [.78, .1]], P.outline);
            poly([[-1.1, -.3], [-.95, -.3], [-.95, .3], [-1.1, .3]], P.danger);
        } else if (icon === 'stopwatch') {
            g.strokeColor = color; g.lineWidth = Math.max(2.5, size * .1);
            g.circle(0, -size * .06, size * .38); g.stroke();
            g.roundRect(-size * .1, size * .34, size * .2, size * .14, size * .04); g.fill();
            line([0, -.06, 0, .16]); line([0, -.06, .14, -.14]);
        } else if (icon === 'check') line([-.38, 0, -.1, -.28, .4, .3]);
        else if (icon === 'close') { line([-.28, -.28, .28, .28]); line([-.28, .28, .28, -.28]); }
        return node;
    }
}
