import { BlockInputEvents, Color, Graphics, Mask, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { runnerLabel as label, runnerNode as node, RUNNER_UI as T } from './MemeRunnerUI';

export const RUNNER_INTRO_CAPTIONS = ['外卖，准备出发！', '嘿嘿，这单我来送！', '我的外卖呢？！', '你给我站住——！'];
const HOLDS = [1.5, 1.5, 1.5, 2.4];
const CUTS = [
    { x: -254, y: 176, angle: -1.1, dx: -18 }, { x: 254, y: 176, angle: 1.1, dx: 18 },
    { x: -254, y: -176, angle: .8, dx: -18 }, { x: 254, y: -176, angle: -.8, dx: 18 },
];
const ENTER = .65, EXIT = .45;
interface Panel { root: Node; drawing: Sprite; opacity: UIOpacity; }

/** One four-panel storyboard. New drawings reveal in place; prior drawings stay visible. */
export class MemeRunnerIntro {
    readonly root: Node;
    index = 0;
    age = 0;
    private totalAge = 0;
    private closing = -1;
    private readonly board: Node;
    private readonly panels: Panel[] = [];
    private readonly shade: Graphics;
    private readonly opacity: UIOpacity;
    private done = false;

    constructor(parent: Node, frames: Readonly<Record<string, SpriteFrame>>, private readonly finish: () => void) {
        this.root = node('OpeningComic', parent, 1334, 750); this.root.addComponent(BlockInputEvents);
        this.opacity = this.root.addComponent(UIOpacity); this.opacity.opacity = 0;
        this.shade = node('ComicBackdrop', this.root, 1334, 750).addComponent(Graphics);
        this.board = node('ComicBoard', this.root, 1060, 724);
        for (let i = 0; i < 4; i++) {
            const root = node(`ComicPanel-${i}`, this.board, 492, 344);
            const edge = node('ComicInkBorder', root, 456, 310).addComponent(Graphics); edge.node.setPosition(0, 16);
            edge.fillColor = new Color(T.ink); polygon(edge, 226, 154); edge.fill();
            const clip = node(`ComicCut-${i}`, root, 432, 288); clip.setPosition(0, 16);
            clip.addComponent(Mask).type = Mask.Type.GRAPHICS_STENCIL;
            const stencil = clip.getComponent(Graphics)!; stencil.clear(); stencil.fillColor = Color.WHITE;
            polygon(stencil, 216, 144); stencil.fill();
            const art = node(`ComicDrawing-${i}`, clip, 432, 288);
            const drawing = art.addComponent(Sprite); drawing.sizeMode = Sprite.SizeMode.CUSTOM; drawing.trim = false;
            drawing.spriteFrame = frames[`comic-${i}`];
            label(`ComicCaption-${i}`, root, RUNNER_INTRO_CAPTIONS[i], 0, -158, 456, 32, 22);
            this.panels.push({ root, drawing, opacity: root.addComponent(UIOpacity) });
        }
        this.paint();
    }
    layout(width: number, height: number, safe: { centerX: number; centerY: number; width: number; height: number }): void {
        this.root.getComponent(UITransform)!.setContentSize(width, height);
        this.shade.clear(); this.shade.fillColor = new Color('#F4ECD7');
        this.shade.rect(-width / 2, -height / 2, width, height); this.shade.fill();
        const scale = Math.max(.01, Math.min(1, (safe.width - 40) / 1060, (safe.height - 32) / 724));
        this.board.setPosition(safe.centerX, safe.centerY); this.board.setScale(scale, scale, 1);
    }
    get exiting(): boolean { return this.closing >= 0; }
    advance(dt: number): void {
        if (this.done) return;
        dt = Math.max(0, Math.min(.1, dt)); this.totalAge += dt;
        if (this.closing >= 0) {
            this.closing += dt; this.opacity.opacity = Math.round(255 * Math.max(0, 1 - this.closing / EXIT));
            if (this.closing >= EXIT) { this.done = true; this.finish(); } return;
        }
        this.age += dt;
        if (this.age >= HOLDS[this.index]) {
            if (this.index < 3) { this.index++; this.age = 0; } else this.closing = 0;
        }
        this.paint();
    }
    dispose(): void {
        this.done = true; this.root.active = false;
        for (const panel of this.panels) panel.drawing.spriteFrame = null;
        this.panels.length = 0; this.root.destroy();
    }
    private paint(): void {
        this.opacity.opacity = Math.round(255 * Math.min(1, this.totalAge / .3));
        this.panels.forEach((panel, i) => {
            panel.root.active = i <= this.index;
            if (!panel.root.active) return;
            const cut = CUTS[i], p = i < this.index ? 1 : Math.min(1, this.age / ENTER), ease = 1 - (1 - p) ** 3;
            panel.root.setPosition(cut.x + cut.dx * (1 - ease), cut.y - 10 * (1 - ease));
            panel.root.angle = cut.angle;
            panel.opacity.opacity = Math.round(255 * ease);
        });
    }
}
function polygon(g: Graphics, x: number, y: number): void {
    g.moveTo(-x + 10, -y); g.lineTo(x - 28, -y); g.quadraticCurveTo(x - 14, -y, x - 13, -y + 14);
    g.lineTo(x, y - 14); g.quadraticCurveTo(x + 1, y, x - 13, y);
    g.lineTo(-x + 28, y); g.quadraticCurveTo(-x + 14, y, -x + 13, y - 14);
    g.lineTo(-x, -y + 14); g.quadraticCurveTo(-x - 1, -y, -x + 10, -y); g.close();
}
