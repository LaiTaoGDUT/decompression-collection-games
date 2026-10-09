import {
    BitmapFont, Color, EventTouch, Graphics, Label, Layers, Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec2,
} from 'cc';

/**
 * 苍穹铸翼的现代化 UI 组件（参考 tmp/tidal-wings 的界面语言）：
 * 深海军蓝半透明面板 + 青色细描边与高光线、倾斜的高饱和按钮；
 * 普通文字用常规字体（投影 / 描边保证可读），数字用像素位图字体（烘焙描边与投影）。
 * 游戏素材（飞机、敌人、场景）保持像素风，UI 不再使用像素皮肤。
 */
export const COLORS = {
    ink: '#08243C',
    deep: '#071F33',
    panel: '#072334',
    foam: '#8CECFF',
    cream: '#FFF1B8',
    gold: '#FFBF26',
    orange: '#F47B20',
    red: '#ED3F59',
    pink: '#FF6B9E',
    green: '#3DBB57',
    blue: '#2B8FE0',
    white: '#FFFFFF',
    grey: '#91A7AD',
    muted: '#5C8B99',
};

export type ButtonSkin = 'green' | 'pink' | 'blue' | 'gold' | 'dark' | 'red' | 'grey';

const SKIN: Record<ButtonSkin, { face: string; light: string; dark: string; text: string }> = {
    green: { face: '#35B04B', light: '#7BEA86', dark: '#1D6E31', text: '#FFFFFF' },
    pink: { face: '#D83E72', light: '#FF8DB2', dark: '#7E1E42', text: '#FFFFFF' },
    blue: { face: '#2387D6', light: '#7FCBFF', dark: '#124F86', text: '#FFFFFF' },
    gold: { face: '#E8A322', light: '#FFE08A', dark: '#8A5A10', text: '#08243C' },
    dark: { face: '#0E2E44', light: '#8CECFF', dark: '#04121E', text: '#E8FBFF' },
    red: { face: '#C9364D', light: '#FF8A98', dark: '#6E1626', text: '#FFFFFF' },
    grey: { face: '#3A4C58', light: '#7E95A2', dark: '#1B252C', text: '#9FB2BC' },
};

const colorCache = new Map<string, Color>();

export function color(hex: string, alpha = 255): Color {
    const key = `${hex}:${Math.round(alpha)}`;
    let c = colorCache.get(key);
    if (!c) {
        c = new Color();
        Color.fromHEX(c, hex);
        c.a = Math.max(0, Math.min(255, Math.round(alpha)));
        colorCache.set(key, c);
    }
    return c.clone();
}

export interface UiContext {
    frame(key: string): SpriteFrame | undefined;
    /** 像素数字字体（位图，带烘焙描边与投影）。 */
    readonly numberFont?: BitmapFont;
    click?(kind: 'tap' | 'confirm' | 'back' | 'deny'): void;
}

export function node(parent: Node, name: string, w = 0, h = 0, x = 0, y = 0): Node {
    const n = new Node(name);
    n.layer = parent.layer || Layers.Enum.UI_2D;
    parent.addChild(n);
    n.addComponent(UITransform).setContentSize(w, h);
    n.setPosition(x, y);
    return n;
}

export function size(n: Node, w: number, h: number): void {
    n.getComponent(UITransform)!.setContentSize(w, h);
}

export function opacity(n: Node, value: number): void {
    (n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity)).opacity = Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * 贴图存储倍率的倒数：特效与敌弹（fx/、bullet/）按 2 倍分辨率存储，显示时取原图尺寸的一半；
 * 像素素材（含我方像素弹体 shot/）按 1:1 存储。所有“按原图尺寸显示”的地方都要乘这个系数。
 */
export function texScale(key: string): number {
    return key.indexOf('fx/') === 0 || key.indexOf('bullet/') === 0 ? 0.5 : 1;
}

export function sprite(ui: UiContext, parent: Node, key: string, w: number, h: number, x = 0, y = 0, name = key): Sprite {
    const n = node(parent, name, w, h, x, y);
    const s = n.addComponent(Sprite);
    s.sizeMode = Sprite.SizeMode.CUSTOM;
    s.trim = false;
    const frame = ui.frame(key);
    if (frame) s.spriteFrame = frame;
    size(n, w, h);
    return s;
}

/** 按原始像素 × scale 显示的精灵。 */
export function pixelSprite(ui: UiContext, parent: Node, key: string, scale = 1, x = 0, y = 0, name = key): Sprite {
    const frame = ui.frame(key);
    const k = scale * texScale(key);
    const w = frame ? frame.originalSize.width * k : 16;
    const h = frame ? frame.originalSize.height * k : 16;
    return sprite(ui, parent, key, w, h, x, y, name);
}

export function setFrame(ui: UiContext, s: Sprite, key: string, scale = 1): void {
    const frame = ui.frame(key);
    if (!frame || s.spriteFrame === frame) return;
    s.spriteFrame = frame;
    const k = scale * texScale(key);
    size(s.node, frame.originalSize.width * k, frame.originalSize.height * k);
}

export interface TextOptions {
    size?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    width?: number;
    wrap?: boolean;
    bold?: boolean;
    outline?: number;
    outlineColor?: string;
    lineHeight?: number;
    /** 文字投影（默认开启）：叠在游戏画面上时代替底板，形成层次。 */
    shadow?: boolean;
}

/** 常规字体文字（可加深色描边，适合叠在游戏画面上）。 */
export function text(ui: UiContext, parent: Node, value: string, x = 0, y = 0, opts: TextOptions = {}): Label {
    const fontSize = opts.size ?? 26;
    const n = node(parent, 'Text', opts.width ?? 0, fontSize * 1.4, x, y);
    const l = n.addComponent(Label);
    l.useSystemFont = true;
    l.fontFamily = 'sans-serif';
    l.isBold = opts.bold ?? true;
    l.fontSize = fontSize;
    l.lineHeight = opts.lineHeight ?? Math.round(fontSize * 1.3);
    const align = opts.align ?? 'center';
    l.horizontalAlign = align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    const t = n.getComponent(UITransform)!;
    t.setAnchorPoint(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    if (opts.wrap && opts.width) {
        l.overflow = Label.Overflow.RESIZE_HEIGHT;
        l.enableWrapText = true;
    } else {
        l.overflow = Label.Overflow.NONE;
        l.enableWrapText = false;
    }
    const outline = opts.outline ?? 0;
    if (outline > 0) {
        l.enableOutline = true;
        l.outlineWidth = outline;
        l.outlineColor = color(opts.outlineColor ?? COLORS.ink);
    }
    if (opts.shadow ?? true) {
        l.enableShadow = true;
        l.shadowColor = color('#020D18', 200);
        l.shadowOffset = new Vec2(2, -3);
        l.shadowBlur = 2;
    }
    l.color = color(opts.color ?? COLORS.white);
    l.string = value;
    if (opts.wrap && opts.width) t.setContentSize(opts.width, t.height);
    return l;
}

/** 像素数字（分数、金币、连击、关卡号、百分比、距离）。文字一律用 text()。 */
export function num(ui: UiContext, parent: Node, value: string, x = 0, y = 0, opts: { size?: number; color?: string; align?: 'left' | 'center' | 'right' } = {}): Label {
    const fontSize = opts.size ?? 40;
    const n = node(parent, 'Num', 0, fontSize, x, y);
    const l = n.addComponent(Label);
    if (ui.numberFont) {
        l.font = ui.numberFont;
        l.useSystemFont = false;
    } else {
        l.useSystemFont = true;
        l.isBold = true;
    }
    l.fontSize = fontSize;
    l.lineHeight = fontSize;
    l.overflow = Label.Overflow.NONE;
    l.enableWrapText = false;
    const align = opts.align ?? 'center';
    l.horizontalAlign = align === 'left' ? Label.HorizontalAlign.LEFT : align === 'right' ? Label.HorizontalAlign.RIGHT : Label.HorizontalAlign.CENTER;
    l.verticalAlign = Label.VerticalAlign.CENTER;
    n.getComponent(UITransform)!.setAnchorPoint(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5);
    l.color = color(opts.color ?? COLORS.gold);
    l.string = value;
    return l;
}

// ───────────────────────────── 面板 ─────────────────────────────

export interface PanelStyle {
    fill?: string;
    fillAlpha?: number;
    border?: string;
    borderAlpha?: number;
    accent?: string;
    corners?: boolean;
    skew?: number;
}

/** tidal-wings 的 di()：墨色外框 + 面板色 + 描边与底部高光线；可选斜切与角标。 */
export function drawPanel(g: Graphics, w: number, h: number, style: PanelStyle = {}, cx = 0, cy = 0): void {
    const x = cx - w / 2, y = cy - h / 2;
    const sk = style.skew ?? 0;
    const poly = (inset: number) => {
        g.moveTo(x + inset + sk, y + h - inset);
        g.lineTo(x + w - inset, y + h - inset);
        g.lineTo(x + w - inset - sk, y + inset);
        g.lineTo(x + inset, y + inset);
        g.close();
    };
    g.fillColor = color(COLORS.ink, 235);
    poly(-3);
    g.fill();
    g.fillColor = color(style.fill ?? COLORS.panel, style.fillAlpha ?? 236);
    poly(0);
    g.fill();
    g.strokeColor = color(style.border ?? COLORS.foam, style.borderAlpha ?? 120);
    g.lineWidth = 2;
    poly(1);
    g.stroke();
    g.fillColor = color(style.accent ?? COLORS.foam, 150);
    g.rect(x + 8 + sk, y + h - 7, Math.max(1, w - 16 - sk * 2), 3);
    g.fill();
    if (style.corners) {
        g.fillColor = color(style.accent ?? COLORS.foam, 220);
        for (const [px, py] of [[x - 2, y + h - 2], [x + w - 12, y + h - 2], [x - 2, y + 8], [x + w - 12, y + 8]]) {
            g.rect(px, py - 6, 14, 3);
            g.fill();
        }
    }
}

export function panel(parent: Node, w: number, h: number, x = 0, y = 0, style: PanelStyle = {}): Node {
    const n = node(parent, 'Panel', w, h, x, y);
    drawPanel(n.addComponent(Graphics), w, h, style);
    return n;
}

/** 小标题：左侧短色条 + 文字。 */
export function heading(ui: UiContext, parent: Node, title: string, x: number, y: number, tone = COLORS.red, sub?: string): Node {
    const n = node(parent, 'Heading', 0, 0, x, y);
    const g = n.addComponent(Graphics);
    g.fillColor = color(tone);
    g.rect(0, -3, 40, 6);
    g.fill();
    text(ui, n, title, 52, 0, { size: 22, color: tone, align: 'left' });
    if (sub) text(ui, n, sub, 0, -34, { size: 20, color: COLORS.foam, align: 'left', bold: false });
    return n;
}

// ───────────────────────────── 按钮 ─────────────────────────────

export interface ButtonOptions {
    w: number;
    h: number;
    x?: number;
    y?: number;
    skin?: ButtonSkin;
    label?: string;
    sub?: string;
    icon?: string;
    iconScale?: number;
    size?: number;
    skew?: number;
    sound?: 'tap' | 'confirm' | 'back' | 'deny';
    onTap: () => void;
}

export interface UiButton {
    node: Node;
    label?: Label;
    sub?: Label;
    icon?: Sprite;
    setEnabled(enabled: boolean): void;
    setSkin(skin: ButtonSkin): void;
    setLabel(text: string): void;
    setSub(text: string): void;
}

export interface UiPriceButton extends UiButton {
    /** 显示金币图标与价格；null 恢复普通按钮内容。 */
    setPrice(value: number | null): void;
}

/** 倾斜的高饱和按钮：顶部亮线、底部暗边厚度；按下下沉并缩小。 */
export function button(ui: UiContext, parent: Node, opts: ButtonOptions): UiPriceButton {
    let skin: ButtonSkin = opts.skin ?? 'green';
    let enabled = true;
    const w = opts.w, h = opts.h;
    const sk = opts.skew ?? Math.min(14, h * 0.16);
    const root = node(parent, `Button-${opts.label ?? opts.icon ?? ''}`, w + sk, h, opts.x ?? 0, opts.y ?? 0);
    const g = node(root, 'Face').addComponent(Graphics);
    const content = node(root, 'Content');
    const fontSize = opts.size ?? (h >= 100 ? 42 : h >= 80 ? 34 : 28);
    const priceSize = Math.min(fontSize, 32);
    let price: number | null = null;
    let priceRow: Node | undefined, priceCoin: Sprite | undefined, priceAmount: Label | undefined;
    let pressed = false;
    const updateTextStyle = () => {
        const effectiveSkin = enabled ? skin : 'grey';
        const s = SKIN[effectiveSkin];
        if (result.label) {
            result.label.color = color(s.text);
            result.label.enableOutline = effectiveSkin !== 'gold';
            result.label.outlineWidth = 2;
            result.label.outlineColor = color(s.dark);
            result.label.enableShadow = effectiveSkin !== 'gold';
        }
        if (result.sub) {
            result.sub.color = color(!enabled ? s.text : skin === 'gold' ? COLORS.ink : COLORS.cream);
            result.sub.enableShadow = effectiveSkin !== 'gold';
        }
        if (priceAmount) priceAmount.color = color(enabled ? COLORS.cream : s.text);
        if (priceCoin) priceCoin.color = color(enabled ? COLORS.white : COLORS.grey);
    };
    const layoutContent = () => {
        const hasPrice = price !== null;
        const hasTitle = !!result.label?.string;
        if (result.label) {
            result.label.fontSize = hasPrice && hasTitle ? Math.min(fontSize, 34) : fontSize;
            result.label.lineHeight = Math.round(result.label.fontSize * 1.3);
            result.label.node.setPosition(result.label.node.position.x, hasPrice && hasTitle ? h * 0.2 : result.sub?.string ? 9 : 0);
        }
        if (result.sub) result.sub.node.active = !hasPrice;
        if (priceRow) {
            priceRow.active = hasPrice;
            priceRow.setPosition(0, hasTitle ? -h * 0.22 : 0);
        }
    };
    /**
     * 按钮外观（游戏风格）：投影 → 墨色描边 → 底部厚度 → 竖向渐变面（顶亮底暗）→ 上半高光 → 内圈亮边 →
     * 两侧箭头装饰（大按钮）→ 底部亮线。按下时面下沉、厚度变薄。
     */
    const draw = () => {
        const s = SKIN[enabled ? skin : 'grey'];
        g.clear();
        const drop = pressed ? 2 : 7;
        const x0 = -w / 2, y0 = -h / 2;
        const lift = pressed ? -2 : 0;
        // 平行四边形在 [ya, yb] 高度区间内的一条（斜边随高度线性偏移），inset 为四周内缩。
        const band = (ya: number, yb: number, oy: number, inset = 0) => {
            const k0 = (ya - y0) / h, k1 = (yb - y0) / h;
            const lx = (k: number) => x0 - sk / 2 + sk * k + inset;
            const rx = (k: number) => x0 + w - sk / 2 + sk * k - inset;
            g.moveTo(lx(k0), ya + oy); g.lineTo(rx(k0), ya + oy); g.lineTo(rx(k1), yb + oy); g.lineTo(lx(k1), yb + oy); g.close();
        };
        const poly = (oy: number, inset = 0) => band(y0 + inset, y0 + h - inset, oy, inset);
        g.fillColor = color('#000000', 70);
        poly(-drop - 6, -4);
        g.fill();
        g.fillColor = color(COLORS.ink, 245);
        poly(-drop - 3, -3);
        g.fill();
        g.fillColor = color(s.dark);
        poly(-drop);
        g.fill();
        const top = skin === 'dark' ? '#1A4C68' : mixHex(s.face, s.light, 0.35);
        const bottom = skin === 'dark' ? '#0A2436' : mixHex(s.face, s.dark, 0.3);
        const bands = 6;
        for (let b = 0; b < bands; b++) {
            const ya = y0 + h * b / bands, yb = y0 + h * (b + 1) / bands;
            g.fillColor = color(mixHex(bottom, top, b / (bands - 1)));
            band(ya, yb + (b < bands - 1 ? 0.5 : 0), lift);
            g.fill();
        }
        // 上半高光。
        g.fillColor = color('#FFFFFF', skin === 'dark' ? 18 : 40);
        band(y0 + h * 0.58, y0 + h - 4, lift, 4);
        g.fill();
        // 内圈亮边。
        g.strokeColor = color(s.light, skin === 'dark' ? 150 : 170);
        g.lineWidth = 2;
        poly(lift, 3);
        g.stroke();
        // 两侧箭头装饰（较大的按钮）。
        if (h >= 80 && w >= 200) {
            g.fillColor = color(s.light, 150);
            const cy = lift, ax = w / 2 - 16;
            for (const side of [-1, 1]) {
                const x = side * ax;
                g.moveTo(x, cy + 9); g.lineTo(x + side * 8, cy); g.lineTo(x, cy - 9); g.lineTo(x - side * 3, cy - 9); g.lineTo(x + side * 5, cy); g.lineTo(x - side * 3, cy + 9); g.close();
            }
            g.fill();
        }
        // 底部亮线。
        g.fillColor = color(s.light, skin === 'dark' ? 120 : 200);
        band(y0 + h - 7, y0 + h - 4, lift, 6);
        g.fill();
        content.setPosition(0, pressed ? -1 : 2);
    };
    const result: UiPriceButton = {
        node: root,
        setEnabled(value: boolean) { enabled = value; draw(); updateTextStyle(); },
        setSkin(value: ButtonSkin) { skin = value; draw(); updateTextStyle(); },
        setLabel(value: string) { if (result.label) result.label.string = value; layoutContent(); },
        setSub(value: string) {
            if (!result.sub) return;
            result.sub.string = value;
            layoutContent();
        },
        setPrice(value: number | null) {
            price = value;
            if (value !== null) {
                if (!priceRow) {
                    priceRow = node(content, 'Price');
                    priceCoin = pixelSprite(ui, priceRow, 'icon/coin', 1, 0, 0, 'Coin');
                    const coinTransform = priceCoin.node.getComponent(UITransform)!;
                    const coinScale = priceSize * 0.85 / coinTransform.width;
                    size(priceCoin.node, coinTransform.width * coinScale, coinTransform.height * coinScale);
                    priceAmount = num(ui, priceRow, '', 0, 0, { size: priceSize, color: COLORS.cream });
                }
                priceAmount!.string = formatNumber(value);
                priceAmount!.updateRenderData(true);
                const coinWidth = priceCoin!.node.getComponent(UITransform)!.width;
                const numberWidth = priceAmount!.node.getComponent(UITransform)!.width;
                const gap = 8, total = coinWidth + gap + numberWidth;
                priceCoin!.node.setPosition((coinWidth - total) / 2, 0);
                priceAmount!.node.setPosition((total - numberWidth) / 2, 0);
            }
            layoutContent();
            updateTextStyle();
        },
    };
    if (opts.icon) {
        const offset = opts.label !== undefined ? -Math.min(w / 2 - 36, (opts.label.length * fontSize) / 2 + 26) : 0;
        result.icon = pixelSprite(ui, content, opts.icon, opts.iconScale ?? 1, offset, 0, 'Icon');
    }
    if (opts.label !== undefined) {
        result.label = text(ui, content, opts.label, opts.icon ? 18 : 0, opts.sub ? 9 : 0, { size: fontSize, color: SKIN[skin].text, outline: skin === 'gold' ? 0 : 2, outlineColor: SKIN[skin].dark });
    }
    if (opts.sub !== undefined) result.sub = text(ui, content, opts.sub, 0, -fontSize * 0.62, { size: 18, color: skin === 'gold' ? COLORS.ink : COLORS.cream, bold: false });
    updateTextStyle();
    draw();
    root.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
        e.propagationStopped = true;
        if (!enabled) return;
        pressed = true; draw(); root.setScale(0.97, 0.97, 1);
    });
    root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { e.propagationStopped = true; pressed = false; draw(); root.setScale(1, 1, 1); });
    root.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        pressed = false; draw(); root.setScale(1, 1, 1);
        if (!enabled) { ui.click?.('deny'); return; }
        ui.click?.(opts.sound ?? 'tap');
        opts.onTap();
    });
    return result;
}

export interface ReportButtonOptions {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    /** 右侧小字（tidal-wings 主按钮的 meta）。 */
    meta?: string;
    fill?: string;
    fillEnd?: string;
    accent?: string;
    primary?: boolean;
    align?: 'left' | 'center';
    size?: number;
    sound?: 'tap' | 'confirm' | 'back' | 'deny';
    onTap: () => void;
}

/**
 * tidal-wings 结算 / 暂停界面的扁平按钮：上下渐变底色 + 左侧强调竖条 + 底部亮线；按下整体下沉。
 * x, y 为左上角（与 tidal 的布局写法一致，便于左对齐排版）。
 */
export function reportButton(ui: UiContext, parent: Node, o: ReportButtonOptions): UiButton {
    const root = node(parent, `Report-${o.label}`, o.w, o.h, o.x + o.w / 2, o.y - o.h / 2);
    const g = node(root, 'Face').addComponent(Graphics);
    const content = node(root, 'Content');
    let enabled = true, pressed = false;
    const accent = o.accent ?? COLORS.foam;
    const draw = () => {
        g.clear();
        const w = o.w, h = o.h, x0 = -w / 2, y0 = -h / 2;
        const top = enabled ? (o.fill ?? '#0E3A52') : '#2A3A44', bottom = enabled ? (o.fillEnd ?? o.fill ?? '#0A2A3E') : '#1E2A32';
        const tone = enabled ? accent : '#5C7280';
        // 墨色外框 → 竖向渐变面 → 上半高光 → 内圈细亮边 → 左侧强调条与底边 → 四角缺口 → 主按钮右侧双箭头。
        g.fillColor = color(COLORS.ink, 235);
        g.rect(x0 - 3, y0 - 3, w + 6, h + 6);
        g.fill();
        verticalGradient(g, x0, y0 + h, w, h, 8, k => [mixHex(top, bottom, k), o.primary ? 250 : 225]);
        g.fillColor = color('#FFFFFF', enabled ? (o.primary ? 34 : 22) : 10);
        g.rect(x0 + 4, y0 + h * 0.55, w - 8, h * 0.45 - 4);
        g.fill();
        g.strokeColor = color(tone, enabled ? 110 : 60);
        g.lineWidth = 2;
        g.rect(x0 + 3, y0 + 3, w - 6, h - 6);
        g.stroke();
        g.fillColor = color(tone);
        g.rect(x0, y0, o.primary ? 7 : 5, h);
        g.rect(x0, y0, w, o.primary ? 4 : 3);
        g.fill();
        g.fillColor = color(COLORS.ink, 235);
        for (const [cx, cy] of [[x0 + w, y0 + h], [x0 + w, y0]]) {
            g.moveTo(cx - 12, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + (cy > 0 ? -12 : 12)); g.close();
        }
        g.fill();
        if (o.primary && enabled) {
            g.fillColor = color(tone, 220);
            for (let i = 0; i < 2; i++) {
                const x = x0 + w - 30 + i * 11;
                g.moveTo(x, 10); g.lineTo(x + 8, 0); g.lineTo(x, -10); g.lineTo(x - 4, -10); g.lineTo(x + 4, 0); g.lineTo(x - 4, 10); g.close();
            }
            g.fill();
        }
        content.setPosition(0, pressed ? -2 : 0);
    };
    const left = (o.align ?? 'center') === 'left';
    const label = text(ui, content, o.label, left ? -o.w / 2 + 28 : 0, 0, {
        size: o.size ?? (o.primary ? 34 : 28), color: COLORS.cream, align: left ? 'left' : 'center',
    });
    const meta = o.meta !== undefined ? text(ui, content, o.meta, o.w / 2 - 24, 0, { size: 20, color: accent, align: 'right' }) : undefined;
    const result: UiButton = {
        node: root,
        label,
        sub: meta,
        setEnabled(v: boolean) { enabled = v; draw(); label.color = color(v ? COLORS.cream : COLORS.grey); },
        setSkin() { /* 扁平按钮配色由创建参数决定 */ },
        setLabel(v: string) { label.string = v; },
        setSub(v: string) { if (meta) meta.string = v; },
    };
    draw();
    root.on(Node.EventType.TOUCH_START, (e: EventTouch) => { e.propagationStopped = true; if (!enabled) return; pressed = true; draw(); root.setScale(0.985, 0.985, 1); });
    root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => { e.propagationStopped = true; pressed = false; draw(); root.setScale(1, 1, 1); });
    root.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        pressed = false; draw(); root.setScale(1, 1, 1);
        if (!enabled) { ui.click?.('deny'); return; }
        ui.click?.(o.sound ?? 'tap');
        o.onTap();
    });
    return result;
}

/**
 * 竖向渐变：从上到下切成 bands 条，条与条按整数边界首尾相接（不重叠，半透明时不会出现叠色细线）。
 * tone(k) 返回第 k（0 = 顶部，1 = 底部）条的 [颜色, 透明度]。
 */
export function verticalGradient(g: Graphics, x: number, top: number, w: number, h: number, bands: number, tone: (k: number) => [string, number]): void {
    for (let i = 0; i < bands; i++) {
        const y0 = Math.round(top - i * h / bands), y1 = Math.round(top - (i + 1) * h / bands);
        if (y0 <= y1) continue;
        const [hex, alpha] = tone(bands > 1 ? i / (bands - 1) : 0);
        g.fillColor = color(hex, alpha);
        g.rect(x, y1, w, y0 - y1);
        g.fill();
    }
}

/** 两个 #RRGGBB 颜色按 k 线性混合。 */
export function mixHex(a: string, b: string, k: number): string {
    const pa = parseInt(a.slice(1, 7), 16), pb = parseInt(b.slice(1, 7), 16);
    const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
    const v = (ch(16) << 16) | (ch(8) << 8) | ch(0);
    let hex = v.toString(16).toUpperCase();
    while (hex.length < 6) hex = `0${hex}`;
    return `#${hex}`;
}

/** 整块区域可点（关卡节点、卡片）。 */
export function tappable(n: Node, onTap: () => void, ui?: UiContext, sound: 'tap' | 'confirm' = 'tap'): void {
    let sx = 0, sy = 0;
    n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
        e.propagationStopped = true;
        const p = e.getUILocation(); sx = p.x; sy = p.y;
        n.setScale(0.95, 0.95, 1);
    });
    n.on(Node.EventType.TOUCH_CANCEL, () => n.setScale(1, 1, 1));
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        n.setScale(1, 1, 1);
        const p = e.getUILocation();
        if (Math.hypot(p.x - sx, p.y - sy) > 30) return;
        ui?.click?.(sound);
        onTap();
    });
}

/** 吞掉触摸的全屏遮罩。 */
export function blocker(parent: Node, w: number, h: number, alpha = 190, hex = '#020D18'): Node {
    const n = node(parent, 'Blocker', w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = color(hex, alpha);
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    const swallow = (e: EventTouch) => { e.propagationStopped = true; };
    n.on(Node.EventType.TOUCH_START, swallow);
    n.on(Node.EventType.TOUCH_MOVE, swallow);
    n.on(Node.EventType.TOUCH_END, swallow);
    return n;
}

/** 分段条（tidal-wings 的 B()）。 */
export function drawSegments(g: Graphics, x: number, y: number, w: number, h: number, total: number, lit: number, tone: string): void {
    for (let i = 0; i < total; i++) {
        const a = Math.round(x + i * w / total) + 1, b = Math.round(x + (i + 1) * w / total) - 1;
        g.fillColor = color(i < lit ? tone : '#24485E');
        g.rect(a, y, Math.max(1, b - a), h);
        g.fill();
        if (i < lit) {
            g.fillColor = color(COLORS.cream, 118);
            g.rect(a, y + h - 1, Math.max(1, b - a), 1);
            g.fill();
        }
    }
}

// ───────────────────────────── 补间 ─────────────────────────────

export class Tweens {
    private items: { t: number; d: number; delay: number; fn: (k: number) => void; done?: () => void; ease: (x: number) => number }[] = [];
    add(duration: number, fn: (k: number) => void, opts: { delay?: number; ease?: (x: number) => number; done?: () => void } = {}): void {
        this.items.push({ t: 0, d: Math.max(0.0001, duration), delay: opts.delay ?? 0, fn, done: opts.done, ease: opts.ease ?? easeOutCubic });
        if ((opts.delay ?? 0) <= 0) fn(0);
    }
    update(dt: number): void {
        for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; it.fn(0); }
            it.t += dt;
            const k = Math.min(1, it.t / it.d);
            it.fn(it.ease(k));
            if (k >= 1) { this.items.splice(i, 1); i--; it.done?.(); }
        }
    }
    clear(): void { this.items = []; }
}

export const cap = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - cap(x), 3);
export const easeOutBack = (x: number) => { const t = cap(x) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };
export const easeInCubic = (x: number) => x * x * x;
export const linear = (x: number) => x;

/** tidal-wings 飘字缩放：0.52 → 1.34 → 1。 */
export function popScale(t: number): number {
    const enter = 0.52 + easeOutBack(t / 0.18) * 0.82;
    return enter + (1 - enter) * cap((t - 0.18) / 0.3);
}

/** 面板入场：轻微放大淡入（tidal-wings 的界面过渡）。 */
export function popIn(tweens: Tweens, n: Node, delay = 0): void {
    n.setScale(0.96, 0.96, 1);
    opacity(n, 0);
    tweens.add(0.26, k => {
        const s = 0.96 + 0.04 * k;
        n.setScale(s, s, 1);
        opacity(n, 255 * k);
    }, { delay });
}

/** 左侧补零（目标库为 ES2015，不能用 padStart）。 */
export function padZero(n: number, length: number): string {
    let s = String(Math.max(0, Math.floor(n)));
    while (s.length < length) s = `0${s}`;
    return s;
}

/** 弹窗入场：整层（遮罩 + 卡片）淡入，卡片轻微放大回弹。 */
export function sheetIn(tweens: Tweens, sheet: Node, card?: Node): void {
    opacity(sheet, 0);
    tweens.add(0.18, k => { if (sheet.isValid) opacity(sheet, 255 * k); });
    if (card) {
        card.setScale(card.scale.x * 0.92, card.scale.y * 0.92, 1);
        const sx = card.scale.x / 0.92, sy = card.scale.y / 0.92;
        tweens.add(0.26, k => { if (card.isValid) card.setScale(sx * (0.92 + 0.08 * k), sy * (0.92 + 0.08 * k), 1); }, { ease: easeOutBack });
    }
}

/** 弹窗退场：整层淡出、卡片微缩，结束后销毁。 */
export function sheetOut(tweens: Tweens, sheet: Node, card?: Node, done?: () => void): void {
    const sx = card ? card.scale.x : 1, sy = card ? card.scale.y : 1;
    tweens.add(0.16, k => {
        if (!sheet.isValid) return;
        opacity(sheet, 255 * (1 - k));
        if (card && card.isValid) card.setScale(sx * (1 - 0.06 * k), sy * (1 - 0.06 * k), 1);
    }, { done: () => { if (sheet.isValid) sheet.destroy(); done?.(); } });
}

/** 暂停图标（两道竖条）画在按钮中心。 */
export function drawPauseGlyph(g: Graphics, tone: string = COLORS.cream): void {
    g.fillColor = color(COLORS.ink, 200);
    g.rect(-11, -13, 8, 28);
    g.rect(5, -13, 8, 28);
    g.fill();
    g.fillColor = color(tone);
    g.rect(-12, -12, 8, 26);
    g.rect(4, -12, 8, 26);
    g.fill();
}

export function pad6(n: number): string {
    return padZero(n, 6);
}

export function formatNumber(n: number): string {
    const v = Math.floor(n);
    if (v < 100000) return String(v);
    if (v < 100000000) return `${(v / 10000).toFixed(v < 1000000 ? 1 : 0)}万`;
    return `${(v / 100000000).toFixed(1)}亿`;
}

/** 背景 cover：等比铺满，允许裁切，禁止拉伸。返回缩放倍数。 */
export function coverSprite(s: Sprite, width: number, height: number): number {
    const f = s.spriteFrame;
    if (!f) { size(s.node, width, height); return 1; }
    const w = f.originalSize.width, h = f.originalSize.height;
    const k = Math.max(width / w, height / h);
    size(s.node, Math.ceil(w * k), Math.ceil(h * k));
    return k;
}
