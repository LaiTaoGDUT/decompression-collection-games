import { EventTouch, Graphics, Mask, Node, SpriteFrame, tween, Tween, Vec3 } from 'cc';
import { bindPressFeedback, drawCapsuleButton, drawPorcelainCard, hexColor, icon, INK, IVORY, MUTED, snakePortrait, textLabel, uiNode } from './CubeAwayChrome';
import { CUBE_AWAY_THEME } from './CubeAwayTheme';
import type { CubeAwayLayoutMetrics } from './CubeAwayLayout';
import type { CubeAwayUICallbacks, MapViewModel } from './CubeAwayUI';
export class CubeAwayMapUI {
    private track?: Node;
    private root?: Node;
    private model?: MapViewModel;
    private layout?: CubeAwayLayoutMetrics;
    private dragging = false;
    private touchId = -1;
    private startX = 0;
    private lastX = 0;
    private lastTime = 0;
    private velocity = 0;
    private moved = 0;
    private sliding = false;
    constructor(private readonly callbacks: CubeAwayUICallbacks, private readonly portraitFrame: SpriteFrame) {}
    show(root: Node, model: MapViewModel, layout: CubeAwayLayoutMetrics): void {
        this.dispose(); this.root = root; this.model = model; this.layout = layout; root.destroyAllChildren();
        const s = layout.chromeScale, cx = layout.centerX, top = layout.safeTop;
        const back = drawPorcelainCard(root, 'MapBack', 80, 80, 40); back.setScale(s, s, 1); back.setPosition(cx - 298 * s, top - 54 * s);
        icon(back, 'MapBackIcon', 'back', 56); bindPressFeedback(back, () => this.callbacks.onBackToLobby());
        textLabel(root, 'MapTitle', '关卡地图', 52 * s, 500 * s, 90 * s).node.setPosition(cx, top - 54 * s);
        const progressY = top - 133 * s;
        const progress = `已解开 ${model.cleared} / ${model.totalLevels} 关`;
        textLabel(root, 'MapProgress', progress, 32 * s, 640 * s, 60 * s, MUTED).node.setPosition(cx, progressY);
        const bottom = layout.safeBottom + 190 * s, mapTop = progressY - 54 * s;
        const height = Math.max(120, mapTop - bottom);
        const pager = uiNode(root, 'ChapterPager', layout.safeWidth, height + 50 * s); pager.setPosition(cx, (mapTop + bottom) / 2);
        pager.addComponent(Mask);
        this.track = uiNode(pager, 'ChapterTrack', layout.safeWidth * 3, height);
        for (const offset of [-1, 0, 1]) {
            const chapter = model.chapter.chapter + offset;
            if (chapter < 1 || chapter > model.totalChapters) continue;
            this.page(this.track, chapter, offset * layout.safeWidth, height, model, layout);
        }
        pager.on(Node.EventType.TOUCH_START, this.start, this);
        pager.on(Node.EventType.TOUCH_MOVE, this.move, this);
        pager.on(Node.EventType.TOUCH_END, this.end, this);
        pager.on(Node.EventType.TOUCH_CANCEL, this.cancel, this);
        textLabel(root, 'ChapterGesture', '左右滑动查看更多关卡', 22 * s, 500 * s, 34 * s, MUTED, false)
            .node.setPosition(cx, layout.safeBottom + 148 * s);
        drawCapsuleButton(root, 'ContinueLevel', `继续第 ${model.current} 关`, Math.min(440, layout.safeWidth - 100), 100 * s, 'primary', () => this.callbacks.onPlayLevel(model.current), 42 * s).setPosition(cx, layout.safeBottom + 79 * s);
    }
    private page(track: Node, chapter: number, x: number, height: number, model: MapViewModel, layout: CubeAwayLayoutMetrics): void {
        const page = uiNode(track, `ChapterPage_${chapter}`, layout.safeWidth, height); page.setPosition(x, 0);
        // Keep the route proportions on short screens, with additional natural row spacing on tall screens.
        const s = Math.min(1, height / 756, layout.safeWidth / 750);
        const row = (height - 112 * s) / 4, step = 158 * s, start = (chapter - 1) * 20 + 1;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 20; i++) { const r = Math.floor(i / 4), c = r % 2 ? 3 - i % 4 : i % 4; pts.push([(c - 1.5) * step, height / 2 - 56 * s - r * row]); }
        const path = uiNode(page, 'GardenRoute', layout.safeWidth, height), g = path.addComponent(Graphics);
        g.strokeColor = hexColor(CUBE_AWAY_THEME.mapRoute); g.lineWidth = 14 * s; g.lineCap = Graphics.LineCap.ROUND;
        for (let i = 1; i < 20; i++) {
            const a = pts[i - 1], b = pts[i]; g.moveTo(a[0], a[1]);
            if (i % 4 === 0) { const side = a[0] < 0 ? -1 : 1; g.bezierCurveTo(a[0] + side * 118 * s, a[1], b[0] + side * 118 * s, b[1], b[0], b[1]); }
            else g.lineTo(b[0], b[1]); g.stroke();
        }
        pts.forEach(([px, py], i) => {
            const level = start + i, current = level === model.current, unlocked = level <= model.unlocked;
            const cleared = level <= model.cleared;
            const size = 104 * s;
            const n = uiNode(page, `Level_${level}`, size + 16, size + 16); n.setPosition(px, py);
            const difficulty = model.levels[level - 1].difficulty;
            if (difficulty !== 'normal') {
                const flower = n.addComponent(Graphics); flower.fillColor = hexColor(difficulty === 'expert' ? '#FFBAA9' : '#FFE3A5');
                for (let p = 0; p < 6; p++) { const a = p / 6 * Math.PI * 2; flower.circle(Math.cos(a) * size * .40, Math.sin(a) * size * .40, size * .24); } flower.fill();
            }
            const puck = drawPorcelainCard(n, 'Puck', size, size, size / 2, current ? CUBE_AWAY_THEME.levelCurrent : cleared ? CUBE_AWAY_THEME.levelCleared : IVORY);
            textLabel(puck, 'Number', String(level), (level > 99 ? 37 : 48) * s, size - 8, size * .70, unlocked ? INK : MUTED).node.setPosition(0, unlocked ? 0 : 11 * s);
            if (!unlocked) icon(puck, 'Locked', 'lock', 48 * s).setPosition(0, -28 * s);
            if (current) { const portrait = snakePortrait(n, this.portraitFrame, 66 * s); portrait.setPosition(18 * s, 59 * s); portrait.angle = 12; }
            if (unlocked) bindPressFeedback(n, () => this.callbacks.onPlayLevel(level), .97, () => this.moved < 14 && !this.sliding);
        });
    }
    private start(e: EventTouch): void {
        if (this.sliding || this.dragging) return;
        this.dragging = true; this.touchId = e.getID(); this.startX = this.lastX = e.getUILocation().x;
        this.lastTime = Date.now(); this.velocity = this.moved = 0;
    }
    private move(e: EventTouch): void {
        if (!this.dragging || e.getID() !== this.touchId || !this.track || !this.model) return;
        const x = e.getUILocation().x, now = Date.now(), dt = Math.max(1, now - this.lastTime);
        this.velocity = (x - this.lastX) / dt * 1000; this.lastX = x; this.lastTime = now;
        const dx = x - this.startX; this.moved = Math.max(this.moved, Math.abs(dx));
        const edge = dx > 0 && this.model.chapter.chapter === 1 || dx < 0 && this.model.chapter.chapter === this.model.totalChapters;
        this.track.setPosition(dx * (edge ? .28 : 1), 0);
    }
    private end(e: EventTouch): void {
        if (!this.dragging || e.getID() !== this.touchId) return;
        this.dragging = false;
        const dx = e.getUILocation().x - this.startX;
        const speed = Date.now() - this.lastTime < 120 ? this.velocity : 0;
        const flip = Math.abs(dx) > this.layout!.safeWidth * .18 || Math.abs(dx) > 36 && Math.abs(speed) > 520;
        this.slide(flip ? dx < 0 ? 1 : -1 : 0);
    }
    private cancel(): void { if (this.dragging) { this.dragging = false; this.slide(0); } }
    private slide(direction: number): void {
        if (this.sliding || !this.track || !this.model || !this.layout) return;
        const chapter = this.model.chapter.chapter + direction;
        if (chapter < 1 || chapter > this.model.totalChapters) direction = 0;
        this.sliding = true; const track = this.track;
        tween(track).to(.22, { position: new Vec3(-direction * this.layout.safeWidth, 0) }, { easing: 'quadOut' }).call(() => {
            if (!track.isValid || this.track !== track) return;
            this.sliding = false; this.moved = 0;
            if (direction) this.callbacks.onSelectChapter(chapter);
        }).start();
    }
    dispose(): void {
        if (this.track) Tween.stopAllByTarget(this.track);
        const pager = this.root?.getChildByName('ChapterPager');
        if (pager) { pager.off(Node.EventType.TOUCH_START, this.start, this); pager.off(Node.EventType.TOUCH_MOVE, this.move, this); pager.off(Node.EventType.TOUCH_END, this.end, this); pager.off(Node.EventType.TOUCH_CANCEL, this.cancel, this); }
        this.track = undefined; this.dragging = this.sliding = false; this.moved = 0;
    }
}
