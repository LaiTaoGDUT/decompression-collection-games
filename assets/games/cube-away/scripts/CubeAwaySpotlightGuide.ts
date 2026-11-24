import { BlockInputEvents, EventTouch, Graphics, Node, UITransform, Vec2 } from 'cc';
import { drawPorcelainCard, hexColor, INK, IVORY, textLabel, uiNode } from './CubeAwayChrome';
import type { CubeAwayLayoutMetrics } from './CubeAwayLayout';
import { CUBE_AWAY_THEME, MECHANIC_GUIDES } from './CubeAwayTheme';
import type { MechanicSpotlightTarget } from './CubeAwayView3D';
export class CubeAwaySpotlightGuide {
    private root?: Node;
    private halo?: Node;
    private clock = 0;
    private x = 0;
    private y = 0;
    private radius = 0;
    private halfWidth = 375;
    private halfHeight = 667;
    private readonly start = new Vec2();
    private dismiss?: () => void;
    show(root: Node, key: string, target: MechanicSpotlightTarget, layout: CubeAwayLayoutMetrics, step: number, total: number, dismiss: () => void): void {
        this.hide(root); root.destroyAllChildren(); root.active = true; this.root = root; this.dismiss = dismiss; this.clock = 0;
        root.getComponent(UITransform)!.setContentSize(layout.visibleWidth, layout.visibleHeight);
        if (!root.getComponent(BlockInputEvents)) root.addComponent(BlockInputEvents);
        this.halfWidth = layout.visibleWidth / 2; this.halfHeight = layout.visibleHeight / 2;
        const info = MECHANIC_GUIDES[key] ?? MECHANIC_GUIDES.basic;
        const s = layout.chromeScale;
        this.radius = Math.max(66 * s, Math.min(132 * s, target.radius));
        const available = Math.min(target.x - layout.safeLeft, layout.safeRight - target.x,
            target.y - layout.safeBottom, layout.safeTop - target.y) - 12;
        if (available >= 36 * s) this.radius = Math.min(this.radius, available);
        this.x = Math.max(layout.safeLeft + this.radius + 12, Math.min(layout.safeRight - this.radius - 12, target.x));
        this.y = Math.max(layout.safeBottom + this.radius + 12, Math.min(layout.safeTop - this.radius - 12, target.y));
        // Draw the veil around an explicit circular opening; no inverted stencil dependency.
        const dim = uiNode(root, 'SageVeil', layout.visibleWidth, layout.visibleHeight), dg = dim.addComponent(Graphics);
        const left = -layout.visibleWidth / 2, right = layout.visibleWidth / 2;
        const bottom = -layout.visibleHeight / 2, top = layout.visibleHeight / 2;
        const low = this.y - this.radius, high = this.y + this.radius;
        dg.fillColor = hexColor(CUBE_AWAY_THEME.panelShade, 137);
        dg.rect(left, bottom, right - left, low - bottom); dg.fill();
        dg.rect(left, high, right - left, top - high); dg.fill();
        for (const side of [-1, 1]) {
            dg.moveTo(side < 0 ? left : right, low); dg.lineTo(this.x, low);
            for (let i = 0; i <= 80; i++) {
                const a = -Math.PI / 2 + side * Math.PI * i / 80;
                dg.lineTo(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
            }
            dg.lineTo(side < 0 ? left : right, high); dg.close(); dg.fill();
        }
        if (target.routes?.length) this.drawRoutes(root, key === 'carved' ? 'HollowCrossingRoute' : 'SplitExitRoutes', target.routes, s);
        this.halo = uiNode(root, 'MintSpotlightRing', this.radius * 2 + 20, this.radius * 2 + 20); this.halo.setPosition(this.x, this.y);
        const hg = this.halo.addComponent(Graphics); hg.lineWidth = 8; hg.strokeColor = hexColor(IVORY); hg.circle(0, 0, this.radius + 2); hg.stroke();
        hg.lineWidth = 4; hg.strokeColor = hexColor(CUBE_AWAY_THEME.levelCurrent); hg.circle(0, 0, this.radius + 1); hg.stroke();
        const h = 280 * s, w = Math.min(670 * s, layout.safeWidth - 30);
        const below = this.y - this.radius - 36 * s - h / 2;
        const above = this.y + this.radius + 36 * s + h / 2;
        const aboveFits = above + h / 2 + 30 * s <= layout.safeTop;
        const belowFits = below - h / 2 >= layout.safeBottom + 14;
        const preferAbove = key === 'carved' || key === 'pause';
        const desired = (preferAbove && aboveFits) || !belowFits ? above : below;
        const y = Math.max(layout.safeBottom + h / 2 + 14, Math.min(layout.safeTop - h / 2 - 30 * s, desired));
        const card = drawPorcelainCard(root, 'GuideCard', w, h, 58 * s); card.setPosition(layout.centerX, y);
        const badge = drawPorcelainCard(card, 'MechanicBadge', 140 * s, 60 * s, 30 * s, info.color);
        badge.setPosition(0, h / 2 - 5 * s);
        textLabel(badge, 'MechanicBadgeText', info.badge, 32 * s, 130 * s, 55 * s);
        textLabel(card, 'GuideTitle', key === 'basic' ? '轻点小蛇出发' : info.title, 41 * s, w - 50 * s, 66 * s).node.setPosition(0, 65 * s);
        const desc = textLabel(card, 'GuideCopy', info.summary, 27 * s, w - 80 * s, 96 * s, INK, false); desc.node.setPosition(0, -14 * s);
        const cue = drawPorcelainCard(card, 'GuideCue', 310 * s, 48 * s, 24 * s, CUBE_AWAY_THEME.secondaryButton); cue.setPosition(0, -96 * s);
        textLabel(cue, 'GuideCueText', '点击高亮区域继续', 25 * s, 300 * s, 42 * s);
        if (total > 1) textLabel(card, 'GuideStep', `${step + 1}/${total}`, 22 * s, 72 * s, 40 * s).node.setPosition(w / 2 - 52 * s, h / 2 - 35 * s);
        root.on(Node.EventType.TOUCH_START, this.onStart, this); root.on(Node.EventType.TOUCH_END, this.onEnd, this);
    }
    private drawRoutes(root: Node, name: string, routes: NonNullable<MechanicSpotlightTarget['routes']>, scale: number): void {
        const g = uiNode(root, name).addComponent(Graphics);
        g.fillColor = hexColor(INK);
        const clearance = this.radius - 13 * scale;
        const spacing = 8 * scale;
        for (const { start, end } of routes) {
            const length = Math.hypot(end.x - start.x, end.y - start.y);
            if (length < spacing * 2) continue;
            const dx = (end.x - start.x) / length;
            const dy = (end.y - start.y) / length;
            const cx = start.x - this.x, cy = start.y - this.y;
            const projection = cx * dx + cy * dy;
            const discriminant = projection ** 2 + clearance ** 2 - cx ** 2 - cy ** 2;
            if (discriminant < 0) continue;
            const visibleLength = Math.min(length, -projection + Math.sqrt(discriminant));
            const firstDot = Math.max(0, -projection - Math.sqrt(discriminant));
            if (visibleLength - firstDot < spacing * 1.6) continue;
            for (let d = firstDot; d < visibleLength - spacing; d += spacing) {
                g.circle(start.x + dx * d, start.y + dy * d, 2.2 * scale);
                g.fill();
            }
            const tipX = start.x + dx * visibleLength, tipY = start.y + dy * visibleLength;
            const baseX = tipX - dx * 8 * scale, baseY = tipY - dy * 8 * scale;
            g.moveTo(tipX, tipY);
            g.lineTo(baseX - dy * 5 * scale, baseY + dx * 5 * scale);
            g.lineTo(baseX + dy * 5 * scale, baseY - dx * 5 * scale);
            g.close();
            g.fill();
        }
    }
    hide(root: Node): void {
        root.off(Node.EventType.TOUCH_START, this.onStart, this); root.off(Node.EventType.TOUCH_END, this.onEnd, this);
        this.root = this.halo = undefined; this.dismiss = undefined;
    }
    update(dt: number): void { if (this.halo?.isValid) { this.clock += Math.min(.05, dt); const s = 1 + Math.sin(this.clock * 3.5) * .014; this.halo.setScale(s, s, 1); } }
    private onStart(e: EventTouch): void { this.start.set(e.getUILocation()); }
    private onEnd(e: EventTouch): void {
        if (!this.root || Vec2.distance(this.start, e.getUILocation()) > 20) return;
        const p = e.getUILocation(), local = { x: p.x - this.halfWidth, y: p.y - this.halfHeight };
        if (Math.hypot(local.x - this.x, local.y - this.y) > this.radius + 22) return;
        const cb = this.dismiss; this.hide(this.root); cb?.();
    }
}
