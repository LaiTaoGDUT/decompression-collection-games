import { Color, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { GAIT, gaitFoot, gaitJoint, type GaitPoint } from './MemeRunnerGait';
import { RUNNER_RIG_ART } from './MemeRunnerRigArt';
import type { MemeRunnerMotion } from './MemeRunnerMotion';

interface Limb { upper: Node; lower: Node; tip: Node; }
/** One stable painted body, articulated limbs, and explicit planted-foot trajectories. */
export class MemeRunnerRig {
    readonly root: Node;
    private readonly body: Node;
    private readonly nearLeg: Limb;
    private readonly farLeg: Limb;
    private readonly nearArm: Limb;
    private readonly farArm: Limb;
    private readonly pivot: Node;
    constructor(parent: Node, private readonly frames: Readonly<Record<string, SpriteFrame>>) {
        this.root = new Node('ContinuousRunner'); this.root.layer = parent.layer; this.root.parent = parent;
        this.pivot = new Node('SomersaultPivot'); this.pivot.layer = parent.layer; this.pivot.parent = this.root; this.pivot.setPosition(0, 70);
        const drawing = new Node('RigDrawing'); drawing.layer = parent.layer; drawing.parent = this.pivot; drawing.setPosition(0, -70);
        this.farArm = this.limb(drawing, 'FarArm', false, true);
        this.farLeg = this.limb(drawing, 'FarLeg', true, true);
        this.nearLeg = this.limb(drawing, 'NearLeg', true, false);
        this.nearArm = this.limb(drawing, 'NearArm', false, false);
        this.body = this.part(drawing, 'Body', 'rig-body', .5, 0);
        // Shoulder and hip caps are buried inside the torso; only forearm/hand cross in front.
        this.nearArm.lower.setSiblingIndex(drawing.children.length - 1);
        this.nearArm.tip.setSiblingIndex(drawing.children.length - 1);
    }
    render(m: MemeRunnerMotion): void {
        const air = m.frame.startsWith('air-') || m.frame.startsWith('double-');
        const rolling = m.frame.startsWith('double-');
        const landing = m.grounded ? Math.max(0, 1 - m.landAge / .1) : 0;
        const hip = { x: 0, y: 46 - 2 * Math.cos(m.phase * Math.PI * 4) - 3 * landing };
        const bodyAngle = -6;
        this.body.setPosition(hip.x, hip.y - 7); this.body.angle = bodyAngle;
        this.pivot.angle = rolling ? -360 * Math.min(1, m.jumpAge / (4 / 12)) : 0;
        for (const [leg, arm, offset] of [[this.nearLeg, this.nearArm, 0], [this.farLeg, this.farArm, .5]] as [Limb, Limb, number][]) {
            const phase = (m.phase + offset) % 1, near = offset === 0;
            let foot = gaitFoot(phase);
            if (air) foot = { x: near ? 24 : -25, y: rolling ? near ? 31 : 42 : near ? 12 : 25, planted: false, angle: near ? 15 : -20 };
            foot.x = foot.x * (1 - landing) + (near ? 24 : -22) * landing;
            foot.y *= 1 - landing; foot.angle *= 1 - landing;
            this.leg(leg, hip, foot, foot.angle);
            const angle = bodyAngle * Math.PI / 180, sx = near ? -31 : -12, sy = 51;
            const shoulder = { x: hip.x + sx * Math.cos(angle) - sy * Math.sin(angle), y: hip.y - 7 + sx * Math.sin(angle) + sy * Math.cos(angle) };
            const swing = Math.cos(phase * Math.PI * 2);
            const wrist = { x: shoulder.x - 24 * swing, y: hip.y + 21 + 4 * swing + (air ? 10 : 0) };
            this.arm(arm, shoulder, wrist);
        }
    }
    dispose(): void { for (const s of this.root.getComponentsInChildren(Sprite)) s.spriteFrame = null; this.root.destroy(); }
    private leg(limb: Limb, hip: GaitPoint, foot: GaitPoint, angle: number): void {
        const ankle = { x: foot.x, y: foot.y + GAIT.ankle };
        // Keep the anatomical bend branch through recovery; a lifted heel may be above the knee.
        const knee = gaitJoint(hip, ankle, GAIT.thigh, GAIT.shin);
        this.segment(limb.upper, hip, knee); this.segment(limb.lower, knee, ankle);
        limb.tip.setPosition(foot.x, foot.y); limb.tip.angle = angle;
    }
    private arm(limb: Limb, shoulder: GaitPoint, wrist: GaitPoint): void {
        const elbow = gaitJoint(shoulder, wrist, 22, 20, -1);
        this.segment(limb.upper, shoulder, elbow); this.segment(limb.lower, elbow, wrist);
        limb.tip.setPosition(wrist.x, wrist.y); limb.tip.angle = -15;
    }
    private segment(n: Node, from: GaitPoint, to: GaitPoint): void {
        n.setPosition(from.x, from.y); n.angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
    }
    private limb(parent: Node, name: string, leg: boolean, far: boolean): Limb {
        const tip = this.part(parent, name + (leg ? 'Foot' : 'Hand'), leg ? 'rig-foot' : 'rig-hand', leg ? .25 : .5, leg ? 0 : .85);
        const lower = this.part(parent, name + 'Lower', leg ? 'rig-shin' : 'rig-forearm', .5, .85);
        const upper = this.part(parent, name + 'Upper', leg ? 'rig-thigh' : 'rig-upper-arm', .5, .85);
        if (far) for (const n of [upper, lower, tip]) n.getComponent(Sprite)!.color = new Color(215, 210, 200, 255);
        return { upper, lower, tip };
    }
    private part(parent: Node, name: string, key: string, x: number, y: number): Node {
        const n = new Node(name); n.layer = parent.layer; n.parent = parent;
        const t = n.addComponent(UITransform); t.setContentSize(...RUNNER_RIG_ART[key].size); t.setAnchorPoint(x, y);
        const s = n.addComponent(Sprite); s.sizeMode = Sprite.SizeMode.CUSTOM; s.trim = false; s.spriteFrame = this.frames[key]; return n;
    }
}
