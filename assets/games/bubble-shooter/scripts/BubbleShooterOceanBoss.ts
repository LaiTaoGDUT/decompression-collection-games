import { _decorator, Component, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import type { Bubble, BubbleShooterModel } from './BubbleShooterModel';
const { ccclass } = _decorator;
const PARTS = ['body', 'crown', 'staff-arm', 'right-arm', 'grab-arm'] as const;
type Part = typeof PARTS[number];
export type OceanBossFrames = ReadonlyMap<Part, SpriteFrame>;
export interface BubbleShooterModalDecoration {
    layout(panelWidth: number): void;
    dispose(): void;
}
export type BubbleShooterModalDecorationFactory = (back: Node, front: Node) => BubbleShooterModalDecoration;

/** Load only Ocean Boss assets through the application's resource owner. */
export async function loadOceanBossFrames(assets: AssetService): Promise<OceanBossFrames> {
    const directory = 'visual/regions/ocean/boss';
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', directory);
    const frames = new Map<Part, SpriteFrame>();
    for (const part of PARTS) {
        const frame = bundle.get(`${directory}/boss-${part}/spriteFrame`, SpriteFrame);
        if (!frame) throw new Error(`Ocean Boss SpriteFrame missing: ${part}`);
        frames.set(part, frame);
    }
    return frames;
}

export async function loadOceanCelebration(assets: AssetService): Promise<SpriteFrame> {
    const directory = 'visual/regions/ocean/reward';
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', directory);
    const frame = bundle.get(`${directory}/celebration/spriteFrame`, SpriteFrame);
    if (!frame) throw new Error('Ocean celebration SpriteFrame missing.');
    return frame;
}

function sprite(parent: Node, name: string, frame: SpriteFrame, width: number, x: number, y: number, ax = .5, ay = .5): Node {
    const node = new Node(name); node.layer = parent.layer; node.setParent(parent);
    const ui = node.addComponent(UITransform); ui.setAnchorPoint(ax, ay);
    ui.setContentSize(width, width * frame.originalSize.height / frame.originalSize.width);
    const s = node.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = frame;
    node.setPosition(x, y); return node;
}
function clear(root: Node): void {
    root.getComponentsInChildren(Sprite).forEach(s => s.spriteFrame = null);
    root.removeFromParent(); root.destroy();
}

/** Independent art layers. The host controls pause and invokes enter/cast/defeat. */
@ccclass('BubbleShooterOceanBoss')
export class BubbleShooterOceanBoss extends Component {
    private frames?: OceanBossFrames;
    private figure?: Node;
    private body?: Node;
    private crown?: Node;
    private staff?: Node;
    private arm?: Node;
    private opacity?: UIOpacity;
    private clock = 0;
    private age = 0;
    private phase: 'idle' | 'entry' | 'cast' | 'exit' | 'hidden' = 'hidden';
    private impact?: () => void;
    private complete?: () => void;
    private impactPlayed = false;
    private disposed = false;
    private grabs = new Map<string, { node: Node; x: number; y: number; age: number; retract: boolean }>();
    private grabRoot?: Node;
    paused = true;
    get busy(): boolean { return this.phase === 'entry' || this.phase === 'cast' || this.phase === 'exit'; }

    initialize(frames: OceanBossFrames, grabParent?: Node): void {
        if (this.figure || this.disposed) throw new Error('Ocean Boss already initialized or disposed.');
        for (const part of PARTS) if (!frames.get(part)) throw new Error(`Missing Ocean Boss part: ${part}`);
        this.frames = new Map(frames);
        this.figure = new Node('OceanFigure'); this.figure.layer = this.node.layer; this.figure.setParent(this.node);
        this.opacity = this.figure.addComponent(UIOpacity);
        // Roots overlap underneath the mantle; the face never rotates with a limb.
        this.staff = sprite(this.figure, 'StaffArm', frames.get('staff-arm')!, 205, -90, -130, .92, .53);
        this.arm = sprite(this.figure, 'RightArm', frames.get('right-arm')!, 220, 80, -140, .07, .48);
        this.body = sprite(this.figure, 'Body', frames.get('body')!, 480, 0, -165);
        this.crown = sprite(this.body, 'Crown', frames.get('crown')!, 150, 8, 222);
        if (grabParent) {
            this.grabRoot = new Node('OceanGrabs'); this.grabRoot.layer = grabParent.layer; this.grabRoot.setParent(grabParent);
        }
        this.figure.active = false;
    }
    enter(done?: () => void): boolean {
        if (!this.figure || this.disposed || this.busy) return false;
        this.startPhase('entry', done); this.figure.active = true; this.pose(); return true;
    }
    cast(impact?: () => void, done?: () => void): boolean {
        if (!this.figure || this.disposed || this.phase !== 'idle') return false;
        this.startPhase('cast', done); this.impact = impact; this.impactPlayed = false; return true;
    }
    defeat(done?: () => void): boolean {
        if (!this.figure || this.disposed || this.phase === 'exit' || this.phase === 'hidden') return false;
        this.startPhase('exit', done); this.grabs.forEach(g => { g.retract = true; g.age = 0; }); return true;
    }
    private startPhase(phase: 'entry' | 'cast' | 'exit', done?: () => void): void {
        this.phase = phase; this.age = 0; this.impact = undefined; this.complete = done;
    }
    update(dt: number): void {
        if (this.paused || this.disposed || !this.figure || !Number.isFinite(dt) || dt <= 0) return;
        this.clock += dt; this.age += dt;
        if (this.phase === 'cast' && this.age >= .42 && !this.impactPlayed) {
            this.impactPlayed = true; const callback = this.impact; this.impact = undefined; callback?.();
            if (this.disposed) return;
        }
        const duration = this.phase === 'entry' ? .9 : this.phase === 'cast' ? 1 : this.phase === 'exit' ? 1.15 : Infinity;
        if (this.age >= duration) {
            const exited = this.phase === 'exit'; this.phase = exited ? 'hidden' : 'idle';
            this.figure.active = !exited; this.age = 0;
            const callback = this.complete; this.complete = undefined; callback?.();
            if (this.disposed) return;
        }
        this.pose();
        this.grabs.forEach((g, key) => {
            g.age += dt;
            const t = Math.min(1, g.age / (g.retract ? .35 : .4));
            const visibility = g.retract ? 1 - t : t;
            g.node.getComponent(UIOpacity)!.opacity = Math.round(255 * visibility);
            g.node.setScale(.94 + .06 * visibility, .2 + .8 * visibility, 1);
            g.node.setPosition(g.x, g.y + (1 - visibility) * 85);
            if (g.retract && t === 1) { clear(g.node); this.grabs.delete(key); }
        });
    }
    private pose(): void {
        if (!this.figure) return;
        const breathing = Math.sin(this.clock * 2.1);
        this.figure.setPosition(0, 3 * breathing); this.figure.angle = 0; this.opacity!.opacity = 255;
        this.body!.setScale(1 + .007 * breathing, 1 + .012 * breathing, 1);
        this.crown!.angle = 1.7 * Math.sin(this.clock * 1.6);
        this.staff!.angle = 2 * Math.sin(this.clock * 1.7 + .7);
        this.arm!.angle = 4 * Math.sin(this.clock * 1.9 + 1.1);
        if (this.phase === 'entry') {
            const t = Math.min(1, this.age / .9), eased = 1 - Math.pow(1 - t, 3);
            this.figure.setPosition(0, -180 * (1 - eased) + Math.sin(t * Math.PI) * 12);
            this.opacity!.opacity = Math.round(255 * Math.min(1, t * 3));
        } else if (this.phase === 'cast') {
            const lift = this.age < .35 ? this.age / .35 : this.age < .45 ? 1 - 1.45 * (this.age - .35) / .1 : -.45 * (1 - (this.age - .45) / .55);
            this.staff!.angle = -24 * lift; this.arm!.angle = 32 * lift;
            this.figure.setPosition(0, 12 * lift); this.crown!.angle = -4 * lift;
        } else if (this.phase === 'exit') {
            const t = Math.min(1, this.age / 1.15);
            this.figure.setPosition(0, -230 * t * t); this.figure.angle = 7 * Math.sin(t * 15) * t;
            this.opacity!.opacity = Math.round(255 * (1 - t));
        }
    }
    /** Must be called after the board commits a shot/row, using that same row phase. */
    syncGrabs(bubbles: readonly Bubble[], board: BubbleShooterModel, inserted = false): void {
        if (!this.grabRoot || !this.frames || this.disposed) return;
        if (inserted) {
            const moved = new Map<string, { node: Node; x: number; y: number; age: number; retract: boolean }>();
            this.grabs.forEach((g, key) => { const [row, col] = key.split(':').map(Number); moved.set(`${row + 1}:${col}`, g); });
            this.grabs = moved;
        }
        const active = new Set<string>();
        for (const bubble of bubbles) {
            if (bubble.support !== 'tentacle') continue;
            const key = `${bubble.row}:${bubble.col}`; active.add(key);
            const p = board.position(bubble);
            let g = this.grabs.get(key);
            if (!g) {
                const node = sprite(this.grabRoot, 'Grab-' + key, this.frames.get('grab-arm')!, 78, p.x - 6, p.y - 28, .5, 0);
                node.addComponent(UIOpacity).opacity = 0;
                g = { node, x: p.x - 6, y: p.y - 28, age: 0, retract: false }; this.grabs.set(key, g);
            }
            g.x = p.x - 6; g.y = p.y - 28;
            if (g.retract) { g.retract = false; g.age = 0; }
        }
        this.grabs.forEach((g, key) => { if (!active.has(key) && !g.retract) { g.retract = true; g.age = 0; } });
    }
    /** v7 head behind the panel; arm tips overlap only its upper corners. */
    modalFactory(): BubbleShooterModalDecorationFactory {
        if (!this.frames) throw new Error('Ocean Boss not initialized.');
        const frames = this.frames;
        return (back, _front) => {
            const rear = new Node('OceanModalBack'); rear.layer = back.layer; rear.setParent(back);
            sprite(rear, 'StaffArm', frames.get('staff-arm')!, 170, -125, 285, .8, .52);
            // Both existing arms stay behind the shared panel; the panel covers their lower portions.
            sprite(rear, 'RightArm', frames.get('right-arm')!, 170, 190, 252);
            // Lower body is hidden behind the shared panel rather than cut from its image.
            const body = sprite(rear, 'Body', frames.get('body')!, 560, 0, 195);
            sprite(body, 'Crown', frames.get('crown')!, 175, 9, 259);
            return {
                layout: (width: number) => {
                    const scale = width / 660;
                    const bossScale = 1.08;
                    const y = 240 * (1 - scale) - 16;
                    rear.setScale(scale * bossScale, scale * bossScale, 1);
                    rear.setPosition(0, y);
                },
                dispose: () => { clear(rear); },
            };
        };
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.paused = true; this.impact = this.complete = undefined;
        if (this.figure) clear(this.figure);
        if (this.grabRoot) clear(this.grabRoot);
        this.grabs.clear(); this.frames = undefined;
        this.figure = this.body = this.crown = this.staff = this.arm = this.grabRoot = undefined;
        this.opacity = undefined;
    }
    onDestroy(): void { this.dispose(); }
}
