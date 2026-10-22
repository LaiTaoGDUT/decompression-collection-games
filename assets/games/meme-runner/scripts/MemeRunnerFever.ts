import { Color, Graphics, Node, UITransform } from 'cc';
import { SKILL, type MemeRunnerModel } from './MemeRunnerModel';

const STREAKS = 18;
const GLOW = new Color(255, 140, 50);
const STREAK = new Color(255, 250, 230);

/** Screen-space Fever treatment above the street and below the HUD: an opening flash,
 * warm edge glow and speed streaks driven by distance, so it freezes with the simulation. */
export class MemeRunnerFever {
    readonly root: Node;
    private readonly g: Graphics;
    private bounds = { left: -640, right: 640, bottom: -320, top: 320 };

    constructor(parent: Node) {
        this.root = new Node('RunnerFever'); this.root.layer = parent.layer; this.root.parent = parent;
        this.root.addComponent(UITransform).setContentSize(1280, 640);
        this.g = this.root.addComponent(Graphics); this.root.active = false;
    }

    layout(bounds: { left: number; right: number; bottom: number; top: number }): void { this.bounds = { ...bounds }; }

    render(m: MemeRunnerModel): void {
        const g = this.g; g.clear();
        this.root.active = m.feverTime > 0 && !m.ended;
        if (!this.root.active) return;
        const { left, right, bottom, top } = this.bounds, width = right - left, height = top - bottom;
        const age = SKILL.feverDuration - m.feverTime;
        const strength = Math.max(0, Math.min(1, age / .2, m.feverTime / .5));
        if (age < .25) {
            g.fillColor = new Color(255, 248, 225, Math.round(150 * (1 - age / .25)));
            g.rect(left, bottom, width, height); g.fill();
        }
        const pulse = .8 + .2 * Math.sin(m.time * 10);
        [110, 70, 35].forEach((alpha, i) => {
            g.fillColor = new Color(GLOW.r, GLOW.g, GLOW.b, Math.round(alpha * strength * pulse));
            g.rect(left, top - 20 * (i + 1), width, 20); g.rect(left, bottom + 20 * i, width, 20); g.fill();
        });
        g.lineWidth = 5;
        for (let i = 0; i < STREAKS; i++) {
            const span = width + 600, length = 120 + (i % 3) * 70;
            const x = right + 300 - (m.x * 1.6 + i * 397) % span;
            const y = bottom + 40 + (i * .618 % 1) * (height - 80);
            g.strokeColor = new Color(STREAK.r, STREAK.g, STREAK.b, Math.round((90 + (i % 4) * 35) * strength));
            g.moveTo(x, y); g.lineTo(x + length, y); g.stroke();
        }
    }

    dispose(): void { this.g.clear(); this.root.destroy(); }
}
