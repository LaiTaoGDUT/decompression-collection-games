import { Color, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import { nyanPhase, type MemeRunnerModel } from './MemeRunnerModel';
import { runnerLabel } from './MemeRunnerUI';

/** Collectibles in the world, a shield and a separate readable screen-edge warning. */
export class MemeRunnerItems {
    readonly root: Node;
    private readonly views = new Map<number, Node>();
    private readonly shield: Node;
    private readonly incoming: Node;
    private readonly incomingText: Label;
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>, overlay: Node) {
        this.root = make('RunnerItems', parent, 1280, 640);
        this.incoming = make('IncomingNyan', overlay, 170, 106); this.incoming.addComponent(UIOpacity);
        const marker = make('PaintedWarning', this.incoming, 144, 72); marker.setPosition(0, 15);
        const s = marker.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames['nyan-warning'];
        this.incomingText = runnerLabel('IncomingLane', this.incoming, '', 0, -32, 168, 28, 18, '#81522F');
        this.incomingText.enableOutline = true; this.incomingText.outlineColor = new Color('#FFF6DC'); this.incomingText.outlineWidth = 3;
        this.shield = this.sprite('HeroShield', 'shield-loop-0', 160, 160); this.shield.addComponent(UIOpacity); this.reset();
    }
    render(m: MemeRunnerModel, heroX: number, floor: number, left: number, right: number, cameraY = 0, bottom = -333, top = 333): void {
        const present = new Set<number>();
        for (const p of m.powers) {
            const x = heroX + p.x - m.x;
            if (p.taken || x < left - 70 || x > right + 70) continue;
            present.add(p.id); let n = this.views.get(p.id);
            if (!n) { n = this.sprite(`Power-${p.kind}-${p.id}`, 'power-' + p.kind, 80, 80); this.views.set(p.id, n); }
            n.setPosition(x, floor + p.y + Math.sin(m.time * 4 + p.id) * 4);
        }
        for (const [id, n] of Array.from(this.views.entries())) if (!present.has(id)) { n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); this.views.delete(id); }
        const missile = m.obstacles.filter(o => o.kind.startsWith('nyan-') && !o.broken && !o.hit
            && nyanPhase(o.visibleAge ?? -1) !== 'hidden'
            && (nyanPhase(o.visibleAge ?? -1) === 'warning' || o.x - m.x + heroX > right - 100)).sort((a, b) => a.x - b.x)[0];
        this.incoming.active = !!missile && !m.ended;
        if (missile) {
            this.incoming.setPosition(right - 100, Math.max(bottom + 82, Math.min(top - 72, floor - cameraY + (missile.bottom ?? 0) + 32)));
            this.incomingText.string = missile.kind === 'nyan-high' ? '高位来袭' : '低位来袭';
            this.incoming.getComponent(UIOpacity)!.opacity = 230 + Math.round(Math.sin(m.time * 14) * 25);
        }
        const frame = Math.floor(m.time * 12) % 4;
        this.shield.active = m.shieldTime > 0 && !m.ended;
        this.shield.setPosition(heroX + 3, floor + m.y + (m.sliding ? 26 : 61));
        if (this.shield.active) {
            this.shield.getComponent(Sprite)!.spriteFrame = this.frames[`shield-loop-${frame}`];
            this.shield.setScale(m.sliding ? 1.05 : 1, m.sliding ? .55 : 1, 1);
            this.shield.getComponent(UIOpacity)!.opacity = m.shieldTime < 1.5 ? 175 + Math.round(Math.sin(m.time * 15) * 55) : 255;
        }
    }
    reset(): void { for (const n of Array.from(this.views.values())) { n.getComponent(Sprite)!.spriteFrame = null; n.destroy(); } this.views.clear(); this.incoming.active = this.shield.active = false; }
    dispose(): void {
        this.reset(); this.shield.getComponent(Sprite)!.spriteFrame = null;
        for (const s of this.incoming.getComponentsInChildren(Sprite)) s.spriteFrame = null;
        this.incoming.destroy(); this.root.destroy();
    }
    private sprite(name: string, key: string, w: number, h: number): Node {
        const n = make(name, this.root, w, h), s = n.addComponent(Sprite);
        s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames[key]; return n;
    }
}
function make(name: string, parent: Node, w: number, h: number): Node { const n = new Node(name); n.layer = parent.layer; n.parent = parent; n.addComponent(UITransform).setContentSize(w, h); return n; }
