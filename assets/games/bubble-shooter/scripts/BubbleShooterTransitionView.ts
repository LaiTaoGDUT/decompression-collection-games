import { BlockInputEvents, Color, Director, director, EventTouch, Graphics, Label, Node, Sprite, SpriteFrame, UITransform, UIOpacity } from 'cc';

type Phase = 'idle' | 'closing' | 'covered' | 'rendering' | 'opening' | 'error';

/** Common visual layer. Resource preparation is injected; no scene or platform APIs live here. */
export class BubbleShooterTransitionView {
    readonly root: Node;
    readonly bannerRoot: Node;
    private readonly clouds: Node[] = [];
    private readonly backing: Graphics;
    private readonly banner: Node;
    private readonly shade: Graphics;
    private readonly errorRoot: Node;
    private phase: Phase = 'idle';
    private elapsed = 0;
    private alertTime = -1;
    private bannerScale = 1;
    private alertDone?: () => void;
    private generation = 0;
    private ready = false;
    private failed = false;
    private rendered = 0;
    private prepare?: () => Promise<void>;
    private commit?: () => void;
    private width = 750;
    private height = 1334;
    private cloudWidth = 810;
    private bannerY = 0;

    constructor(parent: Node, cloud: SpriteFrame, banner: SpriteFrame, button: SpriteFrame, exit: () => void) {
        this.bannerRoot = this.node('BossAlertOverlay', parent);
        this.bannerRoot.addComponent(BlockInputEvents);
        this.shade = this.bannerRoot.addComponent(Graphics);
        this.banner = this.sprite('BossAlert', this.bannerRoot, banner);
        this.banner.addComponent(UIOpacity);
        this.root = this.node('RegionCloudTransition', parent);
        this.root.addComponent(BlockInputEvents);
        this.backing = this.root.addComponent(Graphics);
        for (const side of [-1, 1]) this.clouds.push(this.sprite(side < 0 ? 'LeftCloud' : 'RightCloud', this.root, cloud));
        this.errorRoot = this.node('TransitionError', this.root);
        this.label('资源加载未完成', this.errorRoot, 65, 34);
        this.label('请重试，当前进度仍保留', this.errorRoot, 13, 25);
        for (const [i, title] of ['重试', '返回大厅'].entries()) {
            const n = this.sprite(title, this.errorRoot, button);
            n.getComponent(UITransform)!.setContentSize(260, 70); n.setPosition(0, -65 - i * 90);
            this.label(title, n, 0, 28, Color.WHITE);
            n.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                event.propagationStopped = true;
                if (this.phase !== 'error') return;
                if (i === 0) { this.phase = 'covered'; this.launchPrepare(); this.draw(); }
                else exit();
            }, this);
        }
        director.on(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        this.cancel();
    }
    get active(): boolean { return this.phase !== 'idle' || this.alertTime >= 0; }
    get cloudActive(): boolean { return this.phase !== 'idle'; }
    layout(width: number, height: number, centerY: number): void {
        this.width = width; this.height = height; this.bannerY = centerY;
        // The matte's minimum fully opaque width is 49.2%; 1.10 screen widths guarantees overlap.
        this.cloudWidth = Math.max(width * 1.10, height / 3 * 1.03);
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        this.bannerRoot.getComponent(UITransform)!.setContentSize(width, height);
        this.clouds.forEach((n, i) => {
            n.getComponent(UITransform)!.setContentSize(512, 1536);
            const scale = this.cloudWidth / 512; n.setScale(i === 0 ? scale : -scale, scale, 1);
            n.getComponent(UITransform)!.setAnchorPoint(0, .5);
        });
        const native = this.banner.getComponent(Sprite)!.spriteFrame!.originalSize;
        const scale = Math.min(width * .96 / native.width, height * .32 / native.height);
        this.banner.getComponent(UITransform)!.setContentSize(native.width, native.height); this.bannerScale=scale; this.banner.setScale(scale, scale, 1);
        this.errorRoot.setScale(Math.min(1, width / 750), Math.min(1, width / 750), 1);
        this.errorRoot.setPosition(0, centerY);
        this.draw();
    }
    showAlert(done: () => void): void {
        if (this.active) return;
        this.alertTime = 0; this.alertDone = done; this.bannerRoot.active = true;
        this.bannerRoot.setSiblingIndex(this.bannerRoot.parent!.children.length - 1); this.draw();
    }
    start(prepare: () => Promise<void>, commit: () => void): boolean {
        if (this.active) return false;
        this.prepare = prepare; this.commit = commit; this.elapsed = 0; this.phase = 'closing';
        this.root.active = true; this.root.setSiblingIndex(this.root.parent!.children.length - 1);
        this.launchPrepare(); this.draw(); return true;
    }
    revealPrepared(): void {
        this.cancel(); this.phase = 'rendering'; this.rendered = 0; this.root.active = true;
        this.root.setSiblingIndex(this.root.parent!.children.length - 1); this.draw();
    }
    private launchPrepare(): void {
        const generation = ++this.generation; this.ready = false; this.failed = false;
        const prepare = this.prepare;
        Promise.resolve().then(() => generation === this.generation ? prepare?.() : undefined).then(() => {
            if (generation === this.generation) this.ready = true;
        }, error => {
            if (generation !== this.generation) return;
            console.warn('[BubbleShooter] Region preparation failed; retry available.', error);
            this.failed = true;
        });
    }
    update(dt: number): void {
        const step = Math.max(0, Math.min(.05, dt));
        if (this.alertTime >= 0) {
            this.alertTime += step;
            if (this.alertTime >= 1.9) {
                const done = this.alertDone; this.alertDone = undefined; this.alertTime = -1;
                this.bannerRoot.active = false; done?.();
            }
        }
        if (this.phase === 'closing') {
            this.elapsed += step;
            if (this.elapsed >= .55) { this.phase = 'covered'; this.elapsed = 0; }
        }
        if (this.phase === 'covered') {
            if (this.failed) this.phase = 'error';
            else if (this.ready) {
                try { this.commit?.(); this.commit = undefined; this.prepare = undefined; this.phase = 'rendering'; this.rendered = 0; }
                catch (error) { console.warn('[BubbleShooter] Region commit failed.', error); this.phase = 'error'; }
            }
        } else if (this.phase === 'rendering' && this.rendered >= 2) { this.phase = 'opening'; this.elapsed = 0; }
        else if (this.phase === 'opening') {
            this.elapsed += step;
            if (this.elapsed >= .6) { this.phase = 'idle'; this.root.active = false; }
        }
        if (this.active) this.draw();
    }
    private afterDraw(): void { if (this.phase === 'rendering') this.rendered++; }
    cancel(): void {
        this.generation++; this.phase = 'idle'; this.alertTime = -1; this.alertDone = undefined;
        this.prepare = undefined; this.commit = undefined; this.ready = this.failed = false;
        this.root.active = false; this.bannerRoot.active = false; this.errorRoot.active = false;
    }
    private draw(): void {
        this.errorRoot.active = this.phase === 'error';
        this.backing.clear();
        if (this.phase === 'covered' || this.phase === 'rendering' || this.phase === 'error') {
            this.backing.fillColor = Color.WHITE; this.backing.rect(-this.width / 2, -this.height / 2, this.width, this.height); this.backing.fill();
        }
        const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
        const travel = this.phase === 'closing' ? 1 - ease(this.elapsed / .55) : this.phase === 'opening' ? ease(this.elapsed / .6) : 0;
        this.clouds[0]!.setPosition(-this.width / 2 - this.cloudWidth * travel, 0);
        this.clouds[1]!.setPosition(this.width / 2 + this.cloudWidth * travel, 0);
        if (this.alertTime >= 0) {
            const t = this.alertTime;
            const x = t < .25 ? -(this.width + 30) * Math.pow(1 - t / .25, 3) : t > 1.55 ? (this.width + 30) * Math.pow((t - 1.55) / .35, 2) : 0;
            let sx=1, sy=1;
            if(t>=.25 && t<.36) { const u=(t-.25)/.11; sx=1-.23*u; sy=1+.16*u; }
            else if(t>=.36 && t<.51) { const u=(t-.36)/.15; sx=.77+.41*u; sy=1.16+.02*u; }
            else if(t>=.51 && t<.68) { const u=(t-.51)/.17; sx=1.18-.18*u; sy=1.18-.18*u; }
            this.banner.setScale(this.bannerScale*sx,this.bannerScale*sy,1);
            const alpha = Math.min(1, t / .18, (1.9 - t) / .25);
            this.banner.setPosition(x, this.bannerY); this.banner.getComponent(UIOpacity)!.opacity = 255 * Math.max(0, alpha);
            this.shade.clear(); this.shade.fillColor = new Color(30, 13, 46, 115 * Math.max(0, alpha));
            this.shade.rect(-this.width / 2, -this.height / 2, this.width, this.height); this.shade.fill();
        }
    }
    dispose(): void {
        this.cancel(); director.off(Director.EVENT_AFTER_DRAW, this.afterDraw, this);
        this.root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null);
        this.banner.getComponent(Sprite)!.spriteFrame = null;
        this.root.destroy(); this.bannerRoot.destroy();
    }
    private node(name: string, parent: Node): Node {
        const n = new Node(name); n.layer = parent.layer; n.setParent(parent); n.addComponent(UITransform); return n;
    }
    private sprite(name: string, parent: Node, frame: SpriteFrame): Node {
        const n = this.node(name, parent), s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame; return n;
    }
    private label(text: string, parent: Node, y: number, size: number, color = new Color(75, 65, 88)): void {
        const n = this.node(text, parent); n.setPosition(0, y); n.getComponent(UITransform)!.setContentSize(580, 48);
        const label = n.addComponent(Label); label.string = text; label.fontSize = size; label.lineHeight = size + 5;
        label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER; label.color = color;
    }
}
