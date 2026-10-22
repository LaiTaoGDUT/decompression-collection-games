import { dunkCurve, type DunkCurveKey } from './FlappyDunkConfig';

interface Shot { readonly intensity: number; readonly duration: number; readonly curve: readonly DunkCurveKey[]; }
interface ShakeSpec { readonly modifier: readonly number[]; readonly step: number; readonly movement: readonly DunkCurveKey[];
    readonly constant: number; readonly shot: Shot; }
export interface DunkShakeConfig { readonly wall: ShakeSpec; readonly swish: ShakeSpec; }
interface Channel { spec: ShakeSpec; shots: { spec: Shot; age: number }[]; elapsed: number;
    previousX: number; previousY: number; targetX: number; targetY: number; x: number; y: number; active: boolean; }

/** Shaker.GeneraPosizioneRandom samples Unity Random.onUnitSphere. Camera-only
 * offsets stay inside the game's masked world; HUD and platform safety stay fixed.
 */
export class FlappyDunkShake {
    x = 0; y = 0;
    private readonly wall: Channel;
    private readonly swish: Channel;
    constructor(config: DunkShakeConfig) {
        if (!config?.wall || !config.swish) throw new Error('Missing original Flappy Dunk shaker parameters');
        // Channels start still: the camera only shakes for closing walls and swish hits, never on entry.
        const make = (spec: ShakeSpec): Channel => ({ spec, shots: [],
            elapsed: 0, previousX: 0, previousY: 0, targetX: 0, targetY: 0, x: 0, y: 0, active: false });
        this.wall = make(config.wall); this.swish = make(config.swish);
    }
    swishHit(): void { this.swish.shots.push({ spec: this.swish.spec.shot, age: 0 }); }
    advance(dt: number, wallsActive: boolean): void {
        this.tick(this.wall, dt, wallsActive); this.tick(this.swish, dt, true);
        this.x = this.wall.x + this.swish.x; this.y = this.wall.y + this.swish.y;
    }
    private tick(c: Channel, dt: number, enabled: boolean): void {
        if (!enabled) {
            c.x = c.y = c.previousX = c.previousY = c.targetX = c.targetY = c.elapsed = 0; c.active = false; return;
        }
        let intensity = c.spec.constant;
        for (let i = c.shots.length - 1; i >= 0; i--) {
            const shot = c.shots[i];
            if (shot.age >= shot.spec.duration) { c.shots.splice(i, 1); continue; }
            shot.age += dt;
            intensity += shot.spec.intensity * dunkCurve(shot.spec.curve, shot.age / shot.spec.duration);
        }
        intensity = Math.max(0, Math.min(1, intensity));
        c.active = true;
        c.elapsed += dt;
        // LateUpdate evaluates/applies the current segment before choosing the
        // next random target. Reversing these steps changes both shake curves.
        const t = Math.max(0, Math.min(1, dunkCurve(c.spec.movement, c.elapsed / c.spec.step)));
        c.x = c.previousX + (c.targetX - c.previousX) * t;
        c.y = c.previousY + (c.targetY - c.previousY) * t;
        if (c.elapsed >= c.spec.step) {
            c.previousX = c.targetX; c.previousY = c.targetY;
            const z = Math.random() * 2 - 1, angle = Math.random() * Math.PI * 2, radius = Math.sqrt(1 - z * z);
            c.targetX = Math.cos(angle) * radius * intensity * c.spec.modifier[0];
            c.targetY = Math.sin(angle) * radius * intensity * c.spec.modifier[1];
            c.elapsed = 0;
        }
    }
}
