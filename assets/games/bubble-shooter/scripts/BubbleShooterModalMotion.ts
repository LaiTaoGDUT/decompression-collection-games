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
        const duration = this.phase === 'open' ? .24 : .18;
        if (this.elapsed < duration) return;
        const resolve = this.resolve; this.resolve = undefined; this.phase = 'still'; resolve?.(true);
    }
    private draw(): void {
        let sx = 1, sy = 1, offset = 0, alpha = 1;
        if (this.phase === 'open') {
            const t = Math.min(1, this.elapsed / .24), u=t-1;
            const back=1+2.70158*u*u*u+1.70158*u*u;
            sx=.88+.12*back; sy=.74+.26*back; alpha=Math.min(1,t*3);
        } else if (this.phase === 'close') {
            const t = Math.min(1, this.elapsed / .18), ease=t*t;
            sx=1-.12*ease; sy=1-.26*ease; alpha=1-ease;
        }
        this.content.setScale(this.scale * sx, this.scale * sy, 1);
        this.content.setPosition(0, this.y + offset * this.scale);
        this.opacity.opacity = 255 * alpha;
    }
}
