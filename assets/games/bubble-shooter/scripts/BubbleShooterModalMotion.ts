import { Node, UIOpacity } from 'cc';

/** Presentation clock owned by the game; cancellation settles any pending close action. */
export class BubbleShooterModalMotion {
    private elapsed = 0;
    private phase: 'open' | 'close' | 'still' = 'still';
    private scale = 1;
    private y = 0;
    private resolve?: (completed: boolean) => void;
    private readonly opacity: UIOpacity;
    constructor(private readonly root: Node, private readonly content: Node) {
        this.opacity = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
    }
    get moving(): boolean { return this.phase !== 'still'; }
    layout(scale: number, y: number): void { this.scale = scale; this.y = y; this.draw(); }
    open(): void { this.cancel(); this.phase = 'open'; this.elapsed = 0; this.draw(); }
    close(): Promise<boolean> {
        if (this.phase === 'close') return Promise.resolve(false);
        this.cancel(); this.phase = 'close'; this.elapsed = 0; this.draw();
        return new Promise(resolve => { this.resolve = resolve; });
    }
    cancel(): void {
        const resolve = this.resolve; this.resolve = undefined;
        this.phase = 'still'; this.elapsed = 0; resolve?.(false);
        this.opacity.opacity = 255;
    }
    update(dt: number): void {
        if (!this.root.active || this.phase === 'still') return;
        this.elapsed += Math.max(0, Math.min(dt, .05)); this.draw();
        const duration = this.phase === 'open' ? .3 : .18;
        if (this.elapsed < duration) return;
        const resolve = this.resolve; this.resolve = undefined; this.phase = 'still'; resolve?.(true);
    }
    private draw(): void {
        let size = 1, offset = 0, alpha = 1;
        if (this.phase === 'open') {
            const t = Math.min(1, this.elapsed / .3), u = 1 - t;
            // Slightly under full size throughout: short-screen safe bounds remain intact.
            size = 1 - .1 * u * u + Math.sin(t * Math.PI * 2) * .012 * u;
            offset = -12 * u * u; alpha = Math.min(1, t * 2.5);
        } else if (this.phase === 'close') {
            const t = Math.min(1, this.elapsed / .18);
            size = 1 - .06 * t * t; offset = -10 * t * t; alpha = 1 - t * t;
        }
        this.content.setScale(this.scale * size, this.scale * size, 1);
        this.content.setPosition(0, this.y + offset * this.scale);
        this.opacity.opacity = 255 * alpha;
    }
}
