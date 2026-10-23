import { Color, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform } from 'cc';
import type { MemeRunnerModel } from './MemeRunnerModel';
import { WORLD_ART } from './MemeRunnerWorldArt';
import { setLabelBold } from '../../../services/font/FontBinding';

interface Particle { node: Node; sprite: Sprite; opacity: UIOpacity; key: string;
    x: number; y: number; vx: number; vy: number; gravity: number; age: number; life: number; scale: number; spin: number; }
interface Reward { node: Node; label: Label; opacity: UIOpacity; x: number; y: number; age: number; pop: number; }
const REWARD_STYLE = {
    points: { size: 30, color: new Color(255, 240, 166), pop: 0 },
    perfect: { size: 44, color: new Color(255, 214, 77), pop: .45 },
    fever: { size: 64, color: new Color(255, 146, 61), pop: .7 },
    pop: { size: 40, color: new Color(255, 120, 178), pop: .6 },
};

/** Bounded sprite pools; effects move in world space and freeze with simulation. */
export class MemeRunnerEffects {
    readonly root: Node;
    private active: Particle[] = [];
    private pool: Particle[] = [];
    private rewards: Reward[] = [];
    private rewardPool: Reward[] = [];
    private lastFootfall = -1;
    get activeCount(): number { return this.active.length; }
    get allocatedCount(): number { return this.active.length + this.pool.length; }

    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('RunnerEffects'); this.root.layer = parent.layer; this.root.parent = parent;
    }

    reset(): void {
        for (const p of this.active) { p.node.active = false; this.pool.push(p); }
        for (const p of this.rewards) { p.node.active = false; this.rewardPool.push(p); }
        this.active.length = this.rewards.length = 0; this.lastFootfall = -1;
    }

    advance(m: MemeRunnerModel, dt: number, ending = false): void {
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i]; p.age += dt;
            if (p.age >= p.life) { p.node.active = false; this.pool.push(p); this.active.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= p.gravity * dt; p.node.angle += p.spin * dt;
        }
        for (let i = this.rewards.length - 1; i >= 0; i--) {
            const p = this.rewards[i]; p.age += dt; p.y += (p.pop > 0 ? 25 : 50) * dt;
            if (p.age >= .8) { p.node.active = false; this.rewardPool.push(p); this.rewards.splice(i, 1); }
        }
        if (ending) return;
        const footfall = Math.floor(m.x / (m.sliding ? 130 : 90));
        if (m.grounded && footfall !== this.lastFootfall) this.emit('dust-0', m.x - 42, m.surfaceY + 8, -32, 12, .38, .6, 0);
        this.lastFootfall = footfall;
        for (const event of m.events) {
            if (event === 'jump' || event === 'land' || event === 'slide') this.emit('dust-0', m.x - 14, m.surfaceY + 10, -30, 16, .4, event === 'land' ? 1.2 : .8, 0);
            if (event === 'double') this.emit('arc', m.x, m.y + 60, m.speed * .45, 10, .32, 1.2, 0, -480);
        }
        for (const e of m.feedbacks) {
            // Ordinary passes stay quiet so a Perfect reads as the event worth chasing.
            if (e.kind === 'coin' || e.kind === 'good') continue;
            if (e.kind === 'perfect') {
                for (let i = 0; i < 8; i++) {
                    const angle = i / 8 * Math.PI * 2;
                    this.emit('spark', e.x, e.y, Math.cos(angle) * 210, Math.sin(angle) * 210, .42, .8, 0, 240);
                }
                this.emit('halo', e.x, e.y, 0, 0, .35, 1.1, 0);
                this.reward(e.x, e.y + 95, '完美！', 'perfect'); this.reward(e.x, e.y + 45, `+${e.value}`, 'points'); continue;
            }
            if (e.kind === 'pop') {
                this.emit('halo', e.x - 40, e.y - 70, 0, 0, .3, .9, 0);
                this.reward(e.x - 10, e.y + 20, 'POP!', 'pop'); continue;
            }
            if (e.kind === 'heal') {
                for (let i = 0; i < 6; i++) {
                    const angle = i / 6 * Math.PI * 2;
                    this.emit('heart', e.x, e.y, Math.cos(angle) * 160, 120 + Math.sin(angle) * 120, .7, .7, 260, i % 2 ? 120 : -120);
                }
                this.reward(e.x + 20, e.y + 80, '回血！', 'perfect'); continue;
            }
            if (e.kind === 'deliver') {
                for (let i = 0; i < 18; i++) {
                    const angle = i / 18 * Math.PI * 2;
                    this.emit(i % 3 ? `confetti-${i % 2}` : 'heart', e.x + 80, e.y + 60, Math.cos(angle) * 340, 220 + Math.sin(angle) * 280, 1.1, .9, 560, i % 2 ? 260 : -260);
                }
                this.reward(e.x + 20, e.y + 250, '送达！', 'fever'); continue;
            }
            if (e.kind === 'fever') {
                for (let i = 0; i < 14; i++) {
                    const angle = i / 14 * Math.PI * 2;
                    this.emit(`confetti-${i % 2}`, e.x, e.y, Math.cos(angle) * 300, 160 + Math.sin(angle) * 260, .8, .9, 520, i % 2 ? 300 : -300);
                }
                this.emit('flash', e.x, e.y, 0, 0, .45, 2, 0);
                this.reward(e.x + 140, e.y + 130, '狂飙！', 'fever'); continue;
            }
            const count = e.kind === 'break' ? 9 : 6;
            for (let i = 0; i < count; i++) {
                const angle = i / count * Math.PI * 2;
                const key = e.kind === 'break' ? `wood-${i % 3}` : e.kind === 'hit' || e.kind === 'fall' ? 'confetti-1' : 'shard';
                this.emit(key, e.x, e.y, Math.cos(angle) * 120, 60 + Math.sin(angle) * 135, .5 + i % 3 * .1,
                    e.kind === 'break' ? .45 : .3, 280, i % 2 ? 160 : -160);
            }
            this.emit(e.kind === 'break' ? 'flash' : 'bounce', e.x, e.y, 0, 5, .4, 1, 0);
            if (e.value > 10) this.reward(e.x, e.y + 75, `+${e.value}`, 'points');
        }

    }

    render(m: MemeRunnerModel, heroX: number, floor: number): void {
        for (const p of this.active) {
            const t = p.age / p.life, dust = p.key === 'dust-0';
            if (dust) p.sprite.spriteFrame = this.frames[`fx-dust-${Math.min(3, Math.floor(t * 4))}`];
            p.node.setPosition(heroX + p.x - m.x, floor + p.y);
            const size = p.scale * (dust ? .65 + t * .5 : p.key === 'bounce' || p.key === 'halo' ? .8 + t * .6 : 1);
            p.node.setScale(size, size, 1); p.opacity.opacity = Math.round(255 * Math.min(1, (1 - t) * 2));
        }
        for (const p of this.rewards) {
            p.node.setPosition(heroX + p.x - m.x, floor + p.y); p.opacity.opacity = Math.round(255 * Math.min(1, (1 - p.age / .8) * 2));
            const scale = 1 + p.pop * Math.max(0, 1 - p.age / .16); p.node.setScale(scale, scale, 1);
        }
    }

    dispose(): void {
        this.reset(); for (const p of this.pool) p.sprite.spriteFrame = null;
        this.pool.length = this.rewardPool.length = 0; this.root.destroy();
    }

    private emit(key: string, x: number, y: number, vx: number, vy: number, life: number, scale: number, gravity: number, spin = 0): void {
        if (this.active.length >= 64) return;
        let p = this.pool.pop();
        if (!p) {
            const node = new Node('Effect'); node.layer = this.root.layer; node.parent = this.root; node.addComponent(UITransform);
            const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
            p = { node, sprite, opacity: node.addComponent(UIOpacity), key, x, y, vx, vy, life, scale, gravity, spin, age: 0 };
        }
        Object.assign(p, { key, x, y, vx, vy, life, scale, gravity, spin, age: 0 });
        p.node.active = true; p.node.angle = 0; p.sprite.spriteFrame = this.frames['fx-' + key];
        p.node.getComponent(UITransform)!.setContentSize(...WORLD_ART['fx-' + key].size); this.active.push(p);
    }

    private reward(x: number, y: number, text: string, style: keyof typeof REWARD_STYLE): void {
        if (this.rewards.length >= 10) return;
        let p = this.rewardPool.pop();
        if (!p) {
            const node = new Node('RewardPoints'); node.layer = this.root.layer; node.parent = this.root;
            node.addComponent(UITransform).setContentSize(260, 80); const label = node.addComponent(Label);
            label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
            label.enableOutline = true; label.outlineColor = new Color(59, 64, 61);
            setLabelBold(label, true); p = { node, label, opacity: node.addComponent(UIOpacity), x, y, age: 0, pop: 0 };
        }
        const look = REWARD_STYLE[style];
        p.label.fontSize = look.size; p.label.lineHeight = look.size + 6; p.label.color = look.color; p.label.outlineWidth = look.size > 30 ? 4 : 2;
        p.x = x; p.y = y; p.age = 0; p.pop = look.pop; p.label.string = text; p.node.active = true; this.rewards.push(p);
    }
}
