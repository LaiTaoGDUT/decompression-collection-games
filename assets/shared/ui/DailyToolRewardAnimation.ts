import { BlockInputEvents, Color, Graphics, Label, Node, Sprite, UIOpacity, UITransform, Vec2, Vec3 } from 'cc';
import { FontBinding, setLabelBold } from '../../services/font/FontBinding';

export interface DailyToolRewardBounds {
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly bottom: number;
}

interface DailyToolRewardItem {
    readonly caption: string;
    /** 图标由游戏创建，公共动画不加载或持有任何游戏资源。 */
    readonly createIcon: (parent: Node) => Node;
    /** 每帧取当前道具图标，屏幕重排后不会飞向旧节点。 */
    readonly target: () => Node | undefined;
    readonly onArrive: () => void;
}

interface DailyToolRewardOptions {
    readonly parent: Node;
    readonly bounds: DailyToolRewardBounds;
    readonly items: readonly DailyToolRewardItem[];
    readonly colors: { readonly dim: Color; readonly shadow: Color; readonly accent: Color; readonly text: Color };
    readonly titleFontSize?: number;
    readonly titleGap?: number;
    readonly systemFontOnly?: boolean;
    readonly onFinish?: () => void;
}

interface DailyToolRewardView {
    readonly item: DailyToolRewardItem;
    readonly offsetX: number;
    readonly flying: Node;
    readonly icon: Node;
    readonly opacity: UIOpacity;
    readonly trail: Graphics;
    readonly trailPoints: Vec3[];
    arrived: boolean;
    unavailable: boolean;
    pulsing?: Node;
    pulseScale?: Vec3;
}

const REVEAL = .55;
const HOLD = .95;
const FLIGHT = .5;
const PULSE = .24;
const ARRIVAL = REVEAL + HOLD + FLIGHT;
const DISPLAY_SCALE = 1.2;
const ITEM_SPACING = 216;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** 由游戏 update 驱动的领取时间线；暂停时不推进，销毁时不留下补间或定时器。 */
export class DailyToolRewardAnimation {
    private options?: DailyToolRewardOptions;
    private root?: Node;
    private bounds?: DailyToolRewardBounds;
    private readonly rewards: DailyToolRewardView[] = [];
    private captions?: Node;
    private halo?: Node;
    private sparkles?: Graphics;
    private dimOpacity?: UIOpacity;
    private captionOpacity?: UIOpacity;
    private haloOpacity?: UIOpacity;
    private elapsed = 0;

    get node(): Node | undefined { return this.root; }
    get active(): boolean { return !!this.root?.isValid; }

    start(options: DailyToolRewardOptions): void {
        this.dispose();
        if (options.items.length === 0) return;
        this.options = options;
        const count = options.items.length, span = (count - 1) * ITEM_SPACING;
        const root = this.makeNode(options.parent, 'DailyToolReward', options.bounds.width, options.bounds.height);
        this.root = root;
        root.addComponent(BlockInputEvents);
        const dim = this.makeNode(root, 'Backdrop', options.bounds.width, options.bounds.height);
        dim.addComponent(Graphics).fillColor = options.colors.dim;
        this.dimOpacity = dim.addComponent(UIOpacity);
        this.halo = this.makeNode(root, 'RewardHalo', 330 + 60 * (count - 1), 330);
        this.haloOpacity = this.halo.addComponent(UIOpacity);
        const glow = this.halo.addComponent(Graphics);
        // 多层低透明度柔光，不画有硬边的底盘或放射线；道具本身是视觉主体。
        for (let i = 0; i < 16; i++) {
            glow.fillColor = new Color(255, 251, 242, 2 + Math.floor(i / 4));
            glow.ellipse(0, 0, 162 - i * 8 + 30 * (count - 1), 162 - i * 8); glow.fill();
        }
        for (let i = 5; i >= 0; i--) {
            const shadow = options.colors.shadow;
            glow.fillColor = new Color(shadow.r, shadow.g, shadow.b, Math.round(shadow.a / 8));
            for (let index = 0; index < count; index++) {
                glow.ellipse(index * ITEM_SPACING - span / 2, -77, 30 + i * 4, 4 + i); glow.fill();
            }
        }
        this.sparkles = this.makeNode(this.halo, 'RewardTwinkles', 230, 210).addComponent(Graphics);
        this.captions = this.makeNode(root, 'RewardCaptions', Math.max(300, span + 230) * DISPLAY_SCALE, 260 * DISPLAY_SCALE);
        this.captionOpacity = this.captions.addComponent(UIOpacity);
        options.items.forEach((item, index) => {
            const suffix = index === 0 ? '' : String(index), offsetX = index * ITEM_SPACING - span / 2;
            const trail = this.makeNode(root, `RewardTrail${suffix}`, 1, 1).addComponent(Graphics);
            const flying = this.makeNode(root, `RewardFlyingIcon${suffix}`, 148, 148);
            const opacity = flying.addComponent(UIOpacity), icon = item.createIcon(flying);
            this.rewards.push({ item, offsetX, flying, icon, opacity, trail, trailPoints: [], arrived: false, unavailable: false });
            const iconHeight = icon.getComponent(UITransform)!.height * Math.abs(icon.scale.y);
            const amountY = Math.max(112, iconHeight / 2 + 16 + 25 * .7);
            this.label(this.captions!, `RewardAmount${suffix}`, item.caption, -amountY * DISPLAY_SCALE,
                Math.round(25 * DISPLAY_SCALE), options.colors.text, offsetX * DISPLAY_SCALE, count === 1 ? 300 : 230);
        });
        const titleFontSize = options.titleFontSize ?? 23;
        const iconHalfHeight = Math.max(...this.rewards.map(reward =>
            reward.icon.getComponent(UITransform)!.height * Math.abs(reward.icon.scale.y) / 2));
        const titleY = Math.max(112, iconHalfHeight + (options.titleGap ?? 16) + titleFontSize * .7);
        this.label(this.captions, 'DailyTitle', '每日赠礼', titleY * DISPLAY_SCALE,
            Math.round(titleFontSize * DISPLAY_SCALE), options.colors.text);
        // GameRuntime 在 begin 后用 180ms 收起加载层，留出这段时间再完整弹出。
        this.elapsed = -.2;
        this.relayout(options.bounds);
        this.advance(0);
    }

    setVisible(visible: boolean): void { if (this.root?.isValid) this.root.active = visible; }

    relayout(bounds: DailyToolRewardBounds): void {
        this.bounds = bounds;
        const root = this.root;
        if (!root?.isValid) return;
        root.getComponent(UITransform)!.setContentSize(bounds.width, bounds.height);
        root.setSiblingIndex(root.parent!.children.length - 1);
        const dim = root.getChildByName('Backdrop')!;
        dim.getComponent(UITransform)!.setContentSize(bounds.width, bounds.height);
        const graphics = dim.getComponent(Graphics)!;
        graphics.clear(); graphics.rect(-bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height); graphics.fill();
        // 旧屏幕的尾迹坐标不能带到新安全区，下一帧从重排后的飞行位置继续。
        for (const reward of this.rewards) { reward.trailPoints.length = 0; reward.trail.clear(); }
        this.render();
    }

    advance(seconds: number): void {
        if (!this.active) return;
        if (Number.isFinite(seconds)) this.elapsed += Math.max(0, seconds);
        this.render();
        for (const reward of this.rewards) {
            if ((this.elapsed >= ARRIVAL || reward.unavailable) && !reward.arrived) {
                reward.arrived = true;
                reward.item.onArrive();
            }
        }
        if (this.elapsed >= ARRIVAL + PULSE) {
            const finish = this.options?.onFinish;
            this.dispose();
            finish?.();
        }
    }

    dispose(): void {
        for (const reward of this.rewards) this.restorePulse(reward);
        const root = this.root;
        this.root = undefined;
        if (root?.isValid) {
            root.active = false; root.removeFromParent();
            const nodes = [root];
            for (let i = 0; i < nodes.length; i++) {
                const sprite = nodes[i].getComponent(Sprite);
                if (sprite) sprite.spriteFrame = null;
                nodes.push(...nodes[i].children);
            }
            root.destroy();
        }
        this.options = undefined; this.bounds = undefined;
        this.captions = undefined; this.halo = undefined; this.sparkles = undefined;
        this.dimOpacity = undefined; this.captionOpacity = undefined; this.haloOpacity = undefined;
        this.rewards.length = 0;
        this.elapsed = 0;
    }

    private render(): void {
        const options = this.options, bounds = this.bounds, root = this.root;
        if (!options || !bounds || !root?.isValid) return;
        const contentWidth = Math.max(750, ((this.rewards.length - 1) * ITEM_SPACING + 230) * DISPLAY_SCALE);
        const scale = Math.min(bounds.width / contentWidth, Math.max(1, bounds.top - bounds.bottom) / 650);
        const displayScale = scale * DISPLAY_SCALE;
        const centerY = (bounds.top + bounds.bottom) / 2;
        const reveal = clamp(this.elapsed / REVEAL);
        const flight = clamp((this.elapsed - REVEAL - HOLD) / FLIGHT);
        this.captions!.setPosition(0, centerY);
        this.captions!.setScale(scale, scale, 1);
        this.captionOpacity!.opacity = Math.round(255 * clamp((reveal - .35) / .65) * (1 - clamp(flight * 4)));
        this.halo!.setPosition(0, centerY);
        const haloScale = displayScale * (1 + .02 * Math.sin(this.elapsed * 3));
        this.halo!.setScale(haloScale, haloScale, 1);
        this.haloOpacity!.opacity = Math.round(255 * clamp(reveal / .75) * (1 - clamp(flight * 2)));
        this.dimOpacity!.opacity = Math.round(255 * clamp(reveal / .6) * (1 - flight));
        this.drawTwinkles();
        for (const reward of this.rewards) {
            const flying = reward.flying;
            if (reward.unavailable || !flying.isValid) continue;
            reward.opacity.opacity = Math.round(255 * clamp(reveal / .5));
            const startX = reward.offsetX * displayScale;
            if (this.elapsed < REVEAL + HOLD) {
                const t = reveal - 1;
                const pop = 1 + 2.1 * t * t * t + 1.1 * t * t;
                const size = displayScale * (.3 + .7 * pop);
                const floating = this.elapsed < REVEAL ? -14 * (1 - reveal) : 3 * Math.sin((this.elapsed - REVEAL) * 3);
                flying.setScale(size, size, 1); flying.setPosition(startX, centerY + floating * displayScale);
                flying.angle = -5 * (1 - reveal);
                continue;
            }
            const target = reward.item.target();
            if (!target?.isValid || !target.activeInHierarchy) {
                // 单个目标临时缺失时只收尾该道具，其余道具继续飞入；库存已保存。
                reward.unavailable = true; flying.active = false; reward.trail.clear(); reward.trailPoints.length = 0;
                this.restorePulse(reward);
                continue;
            }
            const end = root.getComponent(UITransform)!.convertToNodeSpaceAR(target.worldPosition);
            const targetWidth = target.getComponent(UITransform)!.width * Math.abs(target.worldScale.x / root.worldScale.x);
            const iconWidth = reward.icon.getComponent(UITransform)!.width * Math.abs(reward.icon.scale.x);
            const targetScale = targetWidth / iconWidth;
            const t = flight * flight * (3 - 2 * flight), remaining = 1 - t;
            const controlX = Math.max(-bounds.width / 2 + 100 * scale,
                Math.min(bounds.width / 2 - 100 * scale, (startX + end.x) / 2 + (end.x < 0 ? -45 : 45) * scale));
            const controlY = Math.min(bounds.top - 150 * scale, (centerY + end.y) / 2 + 40 * scale);
            const startY = centerY + 3 * Math.sin(HOLD * 3) * displayScale;
            flying.setPosition(remaining * remaining * startX + 2 * remaining * t * controlX + t * t * end.x,
                remaining * remaining * startY + 2 * remaining * t * controlY + t * t * end.y);
            const size = displayScale + (targetScale - displayScale) * t;
            flying.setScale(size, size, 1);
            flying.angle = (end.x < 0 ? 1 : -1) * 7 * Math.sin(Math.PI * t);
            flying.active = this.elapsed < ARRIVAL;
            reward.trail.clear();
            if (this.elapsed < ARRIVAL) {
                reward.trailPoints.push(flying.position.clone());
                if (reward.trailPoints.length > 6) reward.trailPoints.shift();
                const color = options.colors.accent;
                reward.trail.strokeColor = new Color(color.r, color.g, color.b, Math.round(55 * (1 - flight)));
                reward.trail.lineWidth = 3 * displayScale; reward.trail.lineCap = Graphics.LineCap.ROUND;
                reward.trailPoints.forEach((point, index) => {
                    if (index === 0) reward.trail.moveTo(point.x, point.y); else reward.trail.lineTo(point.x, point.y);
                });
                reward.trail.stroke();
            } else {
                if (reward.pulsing !== target) {
                    this.restorePulse(reward); reward.pulsing = target; reward.pulseScale = target.scale.clone();
                }
                const bounce = 1 + .15 * Math.sin(Math.PI * clamp((this.elapsed - ARRIVAL) / PULSE));
                target.setScale(reward.pulseScale!.x * bounce, reward.pulseScale!.y * bounce, reward.pulseScale!.z);
            }
        }
    }

    private drawTwinkles(): void {
        const g = this.sparkles, accent = this.options?.colors.accent;
        if (!g || !accent) return;
        g.clear();
        const spread = (this.rewards.length - 1) * ITEM_SPACING / 2;
        const points = [[81 + spread, 41, 6, 0], [-78 - spread, -27, 4, .12], [spread > 0 ? 0 : 45, -66, 3, .22]];
        for (const [x, y, radius, delay] of points) {
            const phase = clamp((this.elapsed - .16 - delay) / .9);
            const pulse = Math.sin(Math.PI * phase);
            if (pulse <= .01) continue;
            const size = radius * pulse;
            g.fillColor = new Color(accent.r, accent.g, accent.b, Math.round(200 * pulse));
            g.moveTo(x, y + size); g.lineTo(x + size * .3, y + size * .3);
            g.lineTo(x + size, y); g.lineTo(x + size * .3, y - size * .3);
            g.lineTo(x, y - size); g.lineTo(x - size * .3, y - size * .3);
            g.lineTo(x - size, y); g.lineTo(x - size * .3, y + size * .3);
            g.close(); g.fill();
        }
    }

    private restorePulse(reward: DailyToolRewardView): void {
        if (reward.pulsing?.isValid && reward.pulseScale) reward.pulsing.setScale(reward.pulseScale);
        reward.pulsing = undefined; reward.pulseScale = undefined;
    }

    private makeNode(parent: Node, name: string, width: number, height: number): Node {
        const node = new Node(name); node.layer = parent.layer;
        node.addComponent(UITransform).setContentSize(width, height); node.setParent(parent); return node;
    }

    private label(parent: Node, name: string, text: string, y: number, size: number, color: Color, x = 0, width = 300): void {
        const node = this.makeNode(parent, name, width * DISPLAY_SCALE, 44 * DISPLAY_SCALE); node.setPosition(x, y);
        const label = node.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size * 1.4;
        if (this.options?.systemFontOnly) {
            label.font = null; label.useSystemFont = true; label.fontFamily = 'Arial';
            (node.getComponent(FontBinding) ?? node.addComponent(FontBinding)).systemFontOnly = true;
        }
        label.color = color; label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER; label.overflow = Label.Overflow.SHRINK;
        label.enableShadow = true; label.shadowColor = new Color(38, 26, 30, 125);
        label.shadowOffset = new Vec2(0, -2); label.shadowBlur = 0;
        label.enableWrapText = false; setLabelBold(label, true);
    }
}
