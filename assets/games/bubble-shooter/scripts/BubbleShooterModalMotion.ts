import { Node, UIOpacity } from 'cc';

/** Presentation clock owned by the game; cancellation settles any pending close action. */
export class BubbleShooterModalMotion {
    private elapsed = 0;
    private phase: 'open' | 'close' | 'still' = 'still';
    private scale = 1;
    private y = 0;
    private resolve?: (completed: boolean) => void;
    private readonly opacity: UIOpacity;
    constructor(private readonly root: Node, private readonly content: Node, private readonly startX = .88, private readonly startY = .74, private readonly energetic = false) {
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
        const duration = this.phase === 'open' ? (this.energetic ? .66 : .24) : .18;
        if (this.elapsed < duration) return;
        const resolve = this.resolve; this.resolve = undefined; this.phase = 'still'; resolve?.(true);
    }
    private draw(): void {
        let sx = 1, sy = 1, offset = 0, alpha = 1;
        if (this.phase === 'open') {
            const t = Math.min(1, this.elapsed / .24), u=t-1;
            const back=1+2.70158*u*u*u+1.70158*u*u;
            sx=this.startX+(1-this.startX)*back; sy=this.startY+(1-this.startY)*back; alpha=Math.min(1,t*3);
            if (this.energetic) {
                const age=this.elapsed * .46 / .66;
                if(age<.18) { const u=1-Math.pow(1-age/.18,3); sx=.72+.4*u; sy=.62+.5*u; }
                else if(age<.32) { const u=(age-.18)/.14; sx=1.12-.16*u; sy=1.12-.16*u; }
                else { const u=Math.min(1,(age-.32)/.14); const ease=u*u*(3-2*u);sx=sy=.96+.04*ease; }
                alpha=Math.min(1,age/.10);
            }
        } else if (this.phase === 'close') {
            const t = Math.min(1, this.elapsed / .18), ease=t*t;
            sx=1-.12*ease; sy=1-.26*ease; alpha=1-ease;
        }
        this.content.setScale(this.scale * sx, this.scale * sy, 1);
        this.content.setPosition(0, this.y + offset * this.scale);
        this.opacity.opacity = 255 * alpha;
    }
}
