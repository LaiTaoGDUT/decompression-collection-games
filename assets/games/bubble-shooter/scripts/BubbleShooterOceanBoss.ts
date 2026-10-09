import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import { _decorator, Component, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
const { ccclass } = _decorator;
export const OCEAN_BOSS_PARTS = ['reclining-body', 'reclining-staff', 'reclining-arm'] as const;
const PARTS = OCEAN_BOSS_PARTS;
type Part = typeof PARTS[number];
export type OceanBossFrames = ReadonlyMap<Part, SpriteFrame>;
/** Load only Ocean Boss assets through the application's resource owner. */
export async function loadOceanBossFrames(assets: AssetService): Promise<OceanBossFrames> {
    const directory = 'visual/regions/ocean/boss';
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', directory, undefined, { excludeAudio: true });
    const frames = new Map<Part, SpriteFrame>();
    for (const part of PARTS) {
        const frame = bundle.get(PACKED_SPRITE_PATHS[`${directory}/boss-${part}/spriteFrame`], SpriteFrame);
        if (!frame) throw new Error(`Ocean Boss SpriteFrame missing: ${part}`);
        frames.set(part, frame);
    }
    return frames;
}

export async function loadOceanCelebration(assets: AssetService): Promise<SpriteFrame> {
    const directory = 'visual/regions/ocean/reward';
    const bundle = await assets.prepareBundle('game-bubble-shooter-assets', directory, undefined, { excludeAudio: true });
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
    private staff?: Node;
    private arm?: Node;
    private opacity?: UIOpacity;
    private clock = 0;
    private age = 0;
    private hitAge = .3;
    private phase: 'idle' | 'entry' | 'cast' | 'exit' | 'hidden' = 'hidden';
    private impact?: () => void;
    private complete?: () => void;
    private impactPlayed = false;
    private disposed = false;
    private skillOrigin?: Node;
    private hitTarget?: Node;
    paused = true;
    get busy(): boolean { return this.phase === 'entry' || this.phase === 'cast' || this.phase === 'exit'; }

    initialize(frames: OceanBossFrames): void {
        if (this.figure || this.disposed) throw new Error('Ocean Boss already initialized or disposed.');
        for (const part of PARTS) if (!frames.get(part)) throw new Error(`Missing Ocean Boss part: ${part}`);
        this.frames = new Map(frames);
        this.figure = new Node('OceanFigure'); this.figure.layer = this.node.layer; this.figure.setParent(this.node);
        this.opacity = this.figure.addComponent(UIOpacity);
        // Rear shoulder stays hidden behind the torso; front shoulder has a feathered overlap.
        // Both rotate about fixed shoulder roots under one shared breathing transform.
        this.staff = sprite(this.figure, 'RecliningStaff', frames.get('reclining-staff')!, 200, -185, 45, .86, .18);
        this.body = sprite(this.figure, 'RecliningBody', frames.get('reclining-body')!, 720, 0, 0, .5, 0);
        this.arm = sprite(this.figure, 'RecliningArm', frames.get('reclining-arm')!, 112, -5, 103, .30, .85);
        this.hitTarget = new Node('ChestHitTarget');
        this.hitTarget.layer = this.node.layer; this.hitTarget.setParent(this.body);
        this.hitTarget.addComponent(UITransform);
        const ui = this.body.getComponent(UITransform)!;
        this.hitTarget.setPosition(-ui.width * .17, ui.height * .27);
        this.skillOrigin = new Node('StaffOrbOrigin');
        this.skillOrigin.layer = this.node.layer; this.skillOrigin.setParent(this.staff);
        this.skillOrigin.addComponent(UITransform);
        const staffUI = this.staff.getComponent(UITransform)!;
        this.skillOrigin.setPosition((.26-.86)*staffUI.width, (.77-.18)*staffUI.height);
        this.figure.active = false;
    }
    get battleHeight(): number { return this.body?.getComponent(UITransform)?.height ?? 270; }
    resetPose(): void {
        if(this.disposed)return;
        this.phase='hidden';this.age=0;this.clock=0;this.impact=undefined;this.complete=undefined;
        if(this.figure)this.figure.active=false;
    }
    showIdle(): void {
        if(!this.figure || this.disposed)return;
        this.phase='idle';this.age=0;this.figure.active=true;this.pose();
    }
    getHitTarget(): Node | undefined { return this.hitTarget; }
    getSkillOrigin(): Node | undefined {return this.skillOrigin;}
    hit(): void { if (!this.disposed) this.hitAge=0; }
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
        this.startPhase('exit', done); return true;
    }
    private startPhase(phase: 'entry' | 'cast' | 'exit', done?: () => void): void {
        this.phase = phase; this.age = 0; this.impact = undefined; this.complete = done;
    }
    update(dt: number): void {
        if (this.paused || this.disposed || !this.figure || !Number.isFinite(dt) || dt <= 0) return;
        this.clock += dt; this.age += dt; this.hitAge=Math.min(.3,this.hitAge+dt);
        if (this.phase === 'cast' && this.age >= .72 && !this.impactPlayed) {
            this.impactPlayed = true; const callback = this.impact; this.impact = undefined; callback?.();
            if (this.disposed) return;
        }
        const duration = this.phase === 'entry' ? .9 : this.phase === 'cast' ? 1.8 : this.phase === 'exit' ? 1.15 : Infinity;
        if (this.age >= duration) {
            const exited = this.phase === 'exit'; this.phase = exited ? 'hidden' : 'idle';
            this.figure.active = !exited; this.age = 0;
            const callback = this.complete; this.complete = undefined; callback?.();
            if (this.disposed) return;
        }
        this.pose();
    }
    private pose(): void {
        if (!this.figure) return;
        const breathing = Math.sin(this.clock * 2.1);
        // Breathing scales around the feet; the body stays seated on the board ledge.
        this.figure.setPosition(0, 0); this.figure.angle = 0; this.opacity!.opacity = 255;
        this.figure.angle = .6 * Math.sin(this.clock * 1.7);
        this.staff!.angle = 1.5 * Math.sin(this.clock * 1.7 + .7);
        this.arm!.angle = 2 * Math.sin(this.clock * 1.9 + 1.1);
        if (this.phase === 'entry') {
            const t = Math.min(1, this.age / .9), eased = 1 - Math.pow(1 - t, 3);
            this.figure.setPosition(0, Math.min(0,-180 * (1 - eased) + Math.sin(t * Math.PI) * 12));
            this.opacity!.opacity = Math.round(255 * Math.min(1, t * 3));
        } else if (this.phase === 'cast') {
            const age=this.age/1.8;
            const lift = age < .35 ? age / .35 : age < .45 ? 1 - 1.45 * (age - .35) / .1 : -.45 * (1 - (age - .45) / .55);
            this.figure.angle = -1.2 * lift;
            this.figure.setPosition(0, 0);
            this.staff!.angle = -12 * lift;
            this.arm!.angle = 8 * lift;
        } else if (this.phase === 'exit') {
            const t = Math.min(1, this.age / 1.15);
            this.figure.setPosition(0, -230 * t * t); this.figure.angle = 7 * Math.sin(t * 15) * t;
            this.opacity!.opacity = Math.round(255 * (1 - t));
        }
        const recoil=Math.sin(Math.min(1,this.hitAge/.3)*Math.PI);
        this.figure.setScale(1+.007*breathing+.035*recoil,1+.012*breathing-.04*recoil,1);
    }
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true; this.paused = true; this.impact = this.complete = undefined;
        if (this.figure) clear(this.figure);
        this.frames = undefined;
        this.figure = this.body = this.staff = this.arm = this.skillOrigin = this.hitTarget = undefined;
        this.opacity = undefined;
    }
    onDestroy(): void { this.dispose(); }
}
