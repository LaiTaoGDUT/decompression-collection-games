import type { Node } from 'cc';

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t ** 3;
/** Overshoot of about 8 %, for things that pop into place. */
export const easeOutBack = (t: number): number => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
/** Decaying spring from 0 back to 0, peaking early: rim wobble, score dip, landing squash. */
export const springPulse = (t: number, cycles = 1.5): number => t >= 1 ? 0 : Math.sin(t * Math.PI * 2 * cycles) * (1 - t) ** 2;

interface Track { node: Node; key: string; delay: number; duration: number; age: number; apply(p: number): void; }

/** Frame-driven UI tweens for 月夜天台. Runs from the game's own update so pause, dispose and
 * destroyed overlays need no engine tween bookkeeping: a track whose node is gone is dropped. */
export class FlappyDunkMotion {
    private tracks: Track[] = [];

    /** Start a track; one running track per node and key, a new one replaces it. `apply(0)` runs at once. */
    play(node: Node, key: string, duration: number, apply: (p: number) => void, delay = 0): void {
        this.stop(node, key);
        this.tracks.push({ node, key, delay, duration: Math.max(1e-4, duration), age: 0, apply });
        apply(0);
    }

    stop(node: Node, key?: string): void {
        this.tracks = this.tracks.filter(t => t.node !== node || (key !== undefined && t.key !== key));
    }

    advance(dt: number): void {
        for (let i = this.tracks.length - 1; i >= 0; i--) {
            const t = this.tracks[i];
            if (!t.node.isValid) { this.tracks.splice(i, 1); continue; }
            t.age += dt;
            const p = Math.min(1, Math.max(0, (t.age - t.delay) / t.duration));
            t.apply(p);
            if (p >= 1) this.tracks.splice(i, 1);
        }
    }

    clear(): void { this.tracks.length = 0; }
    get count(): number { return this.tracks.length; }
}
