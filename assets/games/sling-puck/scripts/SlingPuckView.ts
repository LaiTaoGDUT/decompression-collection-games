import { Color, Graphics, Node, Sprite, UIOpacity, UITransform } from 'cc';
import { SLING_ART } from './SlingPuckArt';
import {
    MAX_PULL, SIDES, sideSign, SLING_WORLD as W, type Side, type SlingEvent, type SlingPuckModel,
} from './SlingPuckModel';
import { DISC_SQUASH, project, SLING_VIEW, type Projected } from './SlingPuckProjection';
import { SIDE_COLOR, SLING_THEME as T, type SlingFrame } from './SlingPuckTheme';
import { color, type SlingPuckUi } from './SlingPuckUi';

interface PuckView { root: Node; ring: Sprite; side: Side; flash: number; held: number; layer: Side }
interface Particle {
    node: Node; sprite: Sprite; transform: UITransform; frame: SlingFrame; live: boolean;
    x: number; y: number; z: number; vx: number; vy: number; vz: number; gravity: number; drag: number;
    age: number; life: number; size: number; grow: number; spin: number; flat: boolean;
    tint: Color;
}
interface BandWave { amplitude: number; age: number; x: number }
interface ArtLayer { x: number; y: number; width: number; height: number }

const PARTICLES = 140;
/** Puck sprites are placed by the top face centre; the image centre sits this far below it. */
const PUCK_IMAGE = { width: W.puckRadius * 2 + 4,
    height: Math.floor(W.puckRadius * 2 * DISC_SQUASH + SLING_VIEW.puckHeight * Math.sin(SLING_VIEW.tilt * Math.PI / 180) + 4) };
const PUCK_OFFSET = PUCK_IMAGE.height / 2 - (2 + W.puckRadius * DISC_SQUASH);

/**
 * The table in perspective: pre-rendered board layers with live pucks, cords, aim guides and effects
 * placed through the shared projection. North pucks sit under the divider, south pucks over it, and the
 * near rail covers everything, so pucks tuck behind the frame and wall like real objects.
 */
export class SlingPuckView {
    readonly world: Node;
    private readonly guide: Graphics;
    private readonly tutorial: Graphics;
    private readonly tutorialHands: Record<Side, Node>;
    tutorialEnabled = true;
    private readonly bands: Record<Side, Graphics>;
    private readonly shadowLayer: Node;
    private readonly puckLayers: Record<Side, Node>;
    private readonly fxLayer: Node;
    private readonly gateGlow: Sprite;
    private readonly pucks: PuckView[] = [];
    private readonly shadows: Node[] = [];
    private readonly particles: Particle[] = [];
    private readonly waves: Record<Side, BandWave> = { south: { amplitude: 0, age: 0, x: 0 }, north: { amplitude: 0, age: 0, x: 0 } };
    private readonly scratch = new Color();
    private readonly p: Projected = { x: 0, y: 0, s: 1 };
    private readonly q: Projected = { x: 0, y: 0, s: 1 };
    private shake = 0;
    private shakeTime = 0;
    private gateFlash = 0;
    private gateColor: string = T.white;
    private time = 0;
    /** Aim guides for the sides a person plays; the bot aims without one. */
    guideSides: readonly Side[] = ['south'];

    constructor(private readonly ui: SlingPuckUi, parent: Node) {
        this.world = ui.make('Table', parent);
        this.layer('Board', 'board', SLING_ART.board);
        this.guide = ui.make('AimGuides', this.world).addComponent(Graphics);
        this.shadowLayer = ui.make('Shadows', this.world);
        const gate = project(0, 0, 0);
        this.gateGlow = ui.sprite('GateGlow', this.world, 'glow', 200, 200 * DISC_SQUASH, T.white, 0);
        this.gateGlow.node.setPosition(gate.x, gate.y);
        const bandNorth = ui.make('BandNorth', this.world).addComponent(Graphics);
        const pucksNorth = ui.make('PucksNorth', this.world);
        this.layer('Divider', 'divider', SLING_ART.divider);
        const bandSouth = ui.make('BandSouth', this.world).addComponent(Graphics);
        const pucksSouth = ui.make('PucksSouth', this.world);
        this.layer('NearRail', 'nearRail', SLING_ART.nearRail);
        this.bands = { north: bandNorth, south: bandSouth };
        this.puckLayers = { north: pucksNorth, south: pucksSouth };
        this.tutorial = ui.make('TutorialFinger', this.world).addComponent(Graphics);
        this.tutorialHands={south:ui.sprite('TutorialHandSouth',this.world,'tutorialHand',150,225).node,
            north:ui.sprite('TutorialHandNorth',this.world,'tutorialHand',150,225).node};
        for(const side of SIDES){this.tutorialHands[side].addComponent(UIOpacity);this.tutorialHands[side].active=false;}
        this.fxLayer = ui.make('Effects', this.world);
        for (let i = 0; i < PARTICLES; i++) {
            const sprite = ui.sprite('Particle', this.fxLayer, 'glow', 16, 16);
            sprite.node.active = false;
            this.particles.push({ node: sprite.node, sprite, transform: sprite.node.getComponent(UITransform)!, frame: 'glow', live: false,
                x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, age: 0, life: 1, size: 16, grow: 0, spin: 0,
                flat: false, tint: new Color() });
        }
    }

    /** Recreate puck views for a fresh round. */
    reset(model: SlingPuckModel): void {
        for (const view of this.pucks) view.root.destroy();
        for (const shadow of this.shadows) shadow.destroy();
        this.pucks.length = this.shadows.length = 0;
        for (const puck of model.pucks) {
            this.shadows.push(this.ui.sprite('PuckShadow', this.shadowLayer, 'shadow', 88, 81, '#000000', 150).node);
            const root = this.ui.make(`Puck-${puck.id}`, this.puckLayers[puck.side], PUCK_IMAGE.width, PUCK_IMAGE.height);
            this.ui.sprite('Body', root, puck.color ? 'puckIvory' : 'puck', PUCK_IMAGE.width, PUCK_IMAGE.height).node.setPosition(0, -PUCK_OFFSET);
            const ring = this.ui.sprite('Ring', root, 'ring', PUCK_IMAGE.width, PUCK_IMAGE.height, SIDE_COLOR[puck.side]);
            ring.node.setPosition(0, -PUCK_OFFSET);
            this.pucks.push({ root, ring, side: puck.side, flash: 0, held: 0, layer: puck.side });
        }
        for (const p of this.particles) { p.live = false; p.node.active = false; }
        this.shake = this.gateFlash = 0;
        this.waves.south.amplitude = this.waves.north.amplitude = 0;
        this.render(model, 0);
    }

    render(model: SlingPuckModel, dt: number): void {
        this.time += dt;
        for (let i = 0; i < this.pucks.length; i++) this.renderPuck(model, i, dt);
        this.sortPucks(model);
        this.drawBands(model, dt);
        this.drawGuides(model);
        this.drawTutorial(model);
        this.tickParticles(dt);
        this.tickShake(dt);
        if (this.gateFlash > 0) {
            this.gateFlash = Math.max(0, this.gateFlash - dt * 2.6);
            this.scratch.set(color(this.gateColor)); this.scratch.a = Math.round(200 * Math.min(1, this.gateFlash));
            this.gateGlow.color = this.scratch;
            const s = .8 + (1 - Math.min(1, this.gateFlash)) * .5; this.gateGlow.node.setScale(s, s, 1);
        }
    }

    onEvent(event: SlingEvent): void {
        if (event.type === 'puckHit') {
            const power = Math.min(1, event.impulse / 1600);
            this.chips(event.x, event.y, 3 + Math.round(power * 7), 160 + power * 420, T.ice);
            this.spawn('glow', event.x, event.y, 8, 0, 0, 0, T.white, .16, 50 + power * 50);
            if (power > .5) this.kick(power * 6);
        } else if (event.type === 'wallHit') {
            const power = Math.min(1, event.impulse / 1800);
            this.chips(event.x, event.y, 2 + Math.round(power * 6), 120 + power * 300, T.ice);
            if (power > .6) this.kick(power * 5);
        } else if (event.type === 'launch') {
            const s = sideSign(event.side);
            this.waves[event.side] = { amplitude: 18 + event.power * 26, age: 0, x: event.x };
            this.chips(event.x, event.y + s * W.puckRadius, 5 + Math.round(event.power * 9), 160 + event.power * 260, T.ice, -s);
            this.ripple(event.x, event.y, SIDE_COLOR[event.side], 120);
            this.pucks[event.id].flash = .5;
        } else if (event.type === 'bandHit') {
            this.waves[event.side] = { amplitude: Math.min(22, event.impulse / 60), age: 0, x: event.x };
        } else if (event.type === 'gate') {
            const to: Side = event.from === 'south' ? 'north' : 'south';
            this.gateFlash = event.own ? 1 : .55; this.gateColor = event.clean ? T.brass : T.white;
            this.ripple(event.x, 0, event.clean ? T.brass : SIDE_COLOR[event.from], 170);
            this.chips(event.x, 0, 8, 340, T.ice, sideSign(to));
            if (event.clean) for (let i = 0; i < 8; i++) {
                const a = Math.random() * Math.PI * 2;
                this.spawn('twinkle', event.x, 0, 20 + Math.random() * 30, Math.cos(a) * 220, Math.sin(a) * 220, 120, T.brass, .6, 22);
            }
            const view = this.pucks[event.id];
            if (view) view.flash = 1;
            this.kick(event.own ? 3 : 1.5);
        } else if (event.type === 'roundEnd' && event.winner) {
            this.celebrate(event.winner);
        }
    }

    kick(amount: number): void { this.shake = Math.min(10, Math.max(this.shake, amount)); this.shakeTime = 0; }

    private layer(name: string, frame: SlingFrame, art: ArtLayer): void {
        this.ui.sprite(name, this.world, frame, art.width, art.height).node.setPosition(art.x, art.y);
    }

    /** Ice dust settling over the emptied half. */
    private celebrate(side: Side): void {
        const s = sideSign(side);
        for (let i = 0; i < 36; i++) {
            const x = (Math.random() - .5) * W.halfWidth * 1.8, y = s * (80 + Math.random() * (W.halfLength - 120));
            this.spawn(i % 4 === 0 ? 'twinkle' : 'shard', x, y, 0, (Math.random() - .5) * 120, (Math.random() - .5) * 120, 380 + Math.random() * 380,
                i % 3 === 0 ? SIDE_COLOR[side] : i % 4 === 0 ? T.brass : T.ice, 1 + Math.random() * .6, 12 + Math.random() * 10, 900);
        }
        this.ripple(0, s * W.halfLength * .45, SIDE_COLOR[side], 520);
    }

    private renderPuck(model: SlingPuckModel, index: number, dt: number): void {
        const puck = model.pucks[index], view = this.pucks[index];
        if (!puck || !view) return;
        view.held += ((puck.holder ? 1 : 0) - view.held) * Math.min(1, dt * 14);
        const p = project(puck.x, puck.y, SLING_VIEW.puckHeight + view.held * 4, this.p);
        const scale = p.s * (1 + view.held * .05);
        view.root.setPosition(p.x, p.y); view.root.setScale(scale, scale, 1);
        const shadow = project(puck.x + 4, puck.y - 7 - view.held * 4, 0, this.q), shadowNode = this.shadows[index];
        shadowNode.setPosition(shadow.x, shadow.y);
        const shadowScale = shadow.s * (1 + view.held * .08); shadowNode.setScale(shadowScale, shadowScale, 1);
        if (view.side !== puck.side) { view.side = puck.side; view.flash = Math.max(view.flash, 1); }
        view.flash = Math.max(0, view.flash - dt * 2.4);
        // The inlay turns white on a flash and while held, then settles back to the half's colour.
        const team = color(SIDE_COLOR[view.side]), f = Math.min(1, view.flash + view.held * .35);
        this.scratch.set(team.r + (255 - team.r) * f, team.g + (255 - team.g) * f, team.b + (255 - team.b) * f, Math.round(180*f));
        view.ring.color = this.scratch;
        // A puck changes layer as its centre crosses the divider.
        const layer: Side = puck.y < 0 ? 'south' : 'north';
        if (layer !== view.layer) { view.layer = layer; view.root.setParent(this.puckLayers[layer]); }
    }

    /** Farther pucks first, so nearer ones overlap them (one insertion pass per frame). */
    private sortPucks(model: SlingPuckModel): void {
        for (const side of SIDES) {
            const children = this.puckLayers[side].children;
            for (let i = 1; i < children.length; i++) {
                const a = model.pucks[idOf(children[i - 1])], b = model.pucks[idOf(children[i])];
                if (a && b && b.y > a.y) children[i].setSiblingIndex(i - 1);
            }
        }
    }

    /** Silicone cords: a cast shadow on the ice, the cord and a thin highlight; wrapped around the pulled puck. */
    private drawBands(model: SlingPuckModel, dt: number): void {
        for (const side of SIDES) {
            const g = this.bands[side]; g.clear();
            const s = sideSign(side), y = s * W.bandY, wave = this.waves[side];
            wave.age += dt;
            const points: number[] = [];
            const contact = model.bandContact(side);
            if (contact) {
                wave.amplitude = 0;
                const wrap = W.puckRadius * .6;
                points.push(-W.bandPostX, y, contact.x - wrap, contact.y - s * 9, contact.x, contact.y, contact.x + wrap, contact.y - s * 9, W.bandPostX, y);
            } else {
                const amplitude = wave.amplitude * Math.exp(-wave.age * 5.5), phase = Math.cos(wave.age * 52);
                points.push(-W.bandPostX, y);
                if (amplitude > .3) {
                    const centre = (wave.x + W.bandPostX) / (2 * W.bandPostX);
                    for (let i = 1; i < 16; i++) {
                        const k = i / 16, shape = k < centre ? k / Math.max(.05, centre) : (1 - k) / Math.max(.05, 1 - centre);
                        points.push(-W.bandPostX + 2 * W.bandPostX * k, y - s * amplitude * phase * Math.sin(shape * Math.PI / 2));
                    }
                }
                points.push(W.bandPostX, y);
            }
            // [colour, alpha, width, height above the ice, screen lift]
            const strokes: [string, number, number, number, number][] = [
                ['#000000', 75, 7, 0, 0], ['#061725', 255, 7, SLING_VIEW.bandHeight, 0],
                ['#29465A', 255, 4, SLING_VIEW.bandHeight, .9], ['#A3C9DE', 160, 1.2, SLING_VIEW.bandHeight, 1.6],
            ];
            for (const [tint, alpha, width, z, lift] of strokes) {
                g.strokeColor = color(tint, alpha); g.lineWidth = width;
                g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND;
                for (let i = 0; i < points.length; i += 2) {
                    // The shadow falls a little towards the viewer.
                    const p = project(points[i] + (z ? 0 : 3), points[i + 1] - (z ? 0 : 6), z, this.p);
                    if (i === 0) g.moveTo(p.x, p.y + lift); else g.lineTo(p.x, p.y + lift);
                }
                g.stroke();
            }
        }
    }

    /** Fine dotted run for each pulled puck of a guided side, plus the power arc around the puck. */
    private drawGuides(model: SlingPuckModel): void {
        const g = this.guide; g.clear();
        for (const puck of model.pucks) {
            const side = puck.holder;
            if (!side || !puck.pulling) continue;
            const depth = model.pullDepth(puck, side);
            if (puck.pulling && depth > 0) this.powerArc(g, puck.x, puck.y, Math.pow(Math.min(1, Math.hypot(puck.x - (puck.anchorX ?? puck.x), depth) / MAX_PULL), 1.15), side);
            if (this.guideSides.indexOf(side) < 0) continue;
            const shot = model.predict(side, puck.x, puck.y, 760, puck.anchorX ?? puck.x);
            if (!shot) continue;
            const path = shot.trace.path, tint = color(T.white);
            let carry = 0, travelled = 0;
            const spacing = 22, total = shot.trace.travel + 80;
            for (let i = 0; i + 3 < path.length; i += 2) {
                const ax = path[i], ay = path[i + 1], bx = path[i + 2], by = path[i + 3], length = Math.hypot(bx - ax, by - ay);
                for (let d = carry; d < length; d += spacing) {
                    const k = Math.max(0, 1 - (travelled + d) / total);
                    const p = project(ax + (bx - ax) * d / length, ay + (by - ay) * d / length, 0, this.p);
                    tint.a = Math.round(220 * k); g.fillColor = tint;
                    g.ellipse(p.x, p.y, (2.5 + 2.5 * k) * p.s, (2.5 + 2.5 * k) * p.s * DISC_SQUASH); g.fill();
                }
                carry = (carry - length) % spacing; if (carry < 0) carry += spacing;
                travelled += length;
            }
            if (shot.trace.gate) {
                const pulse = .8 + .2 * Math.sin(this.time * 8), p = project(shot.trace.gateX, sideSign(side) * 48, 0, this.p);
                const direction=-sideSign(side);g.fillColor=color(T.white,Math.round(240*pulse));
                g.moveTo(p.x,p.y+direction*13*p.s);g.lineTo(p.x-12*p.s,p.y-direction*7*p.s);
                g.lineTo(p.x+12*p.s,p.y-direction*7*p.s);g.close();g.fill();
            }
        }
    }

    /** First-use finger demonstration, dismissed and persisted after a valid human shot. */
    private drawTutorial(model: SlingPuckModel): void {
        const g = this.tutorial; g.clear();
        for(const side of SIDES)this.tutorialHands[side].active=false;
        if (!this.tutorialEnabled || model.phase !== 'play') return;
        const phase = model.elapsed % 3.2;
        for (const side of this.guideSides) {
            if (model.pucks.some(p => p.holder === side)) continue;
            let selected = model.pucks[0], distance = Infinity;
            for (const p of model.pucks) if (model.canGrab(side, p)) {
                const d = Math.hypot(p.x, p.y - sideSign(side) * W.launchY);
                if (d < distance) { distance = d; selected = p; }
            }
            if (distance === Infinity) continue;
            const k = Math.min(1, Math.max(0, (phase - .35) / 1.55));
            const anchor = Math.max(-272, Math.min(272, selected.x));
            const y = selected.y + (sideSign(side) * (W.launchY + MAX_PULL * .72) - selected.y) * k;
            const x = selected.x + (anchor - selected.x) * k;
            const at = project(x, y, SLING_VIEW.puckHeight, this.p), alpha = Math.round(210 * Math.min(1, phase / .2, (3.2 - phase) / .65));
            const sign = side === 'north' ? -1 : 1, hand=this.tutorialHands[side];
            // The image's fingertip is 12 px left of centre and 99 px above it.
            // Clip the demonstration fade as it approaches the frame, so the wrist never covers HUD.
            const edge=project(x,sideSign(side)*(W.halfLength-16),0,this.q);
            const room=Math.abs(at.y-edge.y),visibility=Math.min(1,Math.max(0,(room-128)/50));
            hand.active=visibility>0;hand.angle=side==='north'?180:0;
            hand.setPosition(at.x+12*at.s*sign,at.y-99*at.s*sign);hand.setScale(at.s,at.s,1);
            hand.getComponent(UIOpacity)!.opacity=Math.round(alpha*visibility);
            const origin = project(selected.x, selected.y, 0, this.q);
            g.strokeColor=color(T.teal,Math.round(alpha*.7));g.lineWidth=2;g.ellipse(origin.x,origin.y,42*origin.s,42*origin.s*DISC_SQUASH);g.stroke();
        }
    }

    private powerArc(g: Graphics, x: number, y: number, power: number, side: Side): void {
        const r = W.puckRadius + 10, steps = 40;
        const arc = (to: number, tint: Color) => {
            if (to <= 0) return;
            g.strokeColor = tint; g.lineWidth = 5; g.lineCap = Graphics.LineCap.ROUND;
            for (let i = 0; i <= to; i++) {
                const a = Math.PI / 2 - i / steps * Math.PI * 2;
                const p = project(x + Math.cos(a) * r, y + Math.sin(a) * r, 0, this.p);
                if (i === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
            }
            g.stroke();
        };
        arc(steps, color('#000000', 60));
        arc(Math.round(steps * power), color(power > .92 ? T.brass : SIDE_COLOR[side]));
    }

    private chips(x: number, y: number, count: number, speed: number, tint: string, bias = 0): void {
        for (let i = 0; i < count; i++) {
            const angle = bias ? Math.PI / 2 * bias + (Math.random() - .5) * Math.PI : Math.random() * Math.PI * 2;
            const v = speed * (.4 + Math.random() * .6);
            this.spawn('shard', x, y, 4, Math.cos(angle) * v, Math.sin(angle) * v, 160 + Math.random() * 260, tint, .5 + Math.random() * .3,
                7 + Math.random() * 7, 1300);
        }
    }

    private ripple(x: number, y: number, tint: string, size: number): void {
        this.spawn('ripple', x, y, 0, 0, 0, 0, tint, .55, size);
    }

    private spawn(frame: SlingFrame, x: number, y: number, z: number, vx: number, vy: number, vz: number, tint: string,
        life: number, size: number, gravity = 0): void {
        const p = this.particles.find(item => !item.live) ?? this.particles[0];
        p.live = true; p.node.active = true;
        if (p.frame !== frame) { p.frame = frame; p.sprite.spriteFrame = this.ui.frame(frame); }
        p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.gravity = gravity;
        p.age = 0; p.life = life; p.drag = frame === 'ripple' ? 0 : 1.6;
        p.flat = frame === 'ripple' || frame === 'glow';
        p.size = size; p.grow = frame === 'ripple' ? 1.2 : frame === 'glow' ? .5 : -.3;
        p.spin = frame === 'shard' || frame === 'twinkle' ? (Math.random() - .5) * 900 : 0;
        p.tint.set(color(tint));
        p.node.angle = Math.random() * 360;
        p.node.setSiblingIndex(this.fxLayer.children.length - 1);
    }

    private tickParticles(dt: number): void {
        for (const p of this.particles) {
            if (!p.live) continue;
            p.age += dt;
            if (p.age >= p.life) { p.live = false; p.node.active = false; continue; }
            const k = p.age / p.life, damp = Math.exp(-p.drag * dt);
            p.vx *= damp; p.vy *= damp; p.vz -= p.gravity * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            // Chips bounce once on the ice and skid.
            if (p.z < 0) { p.z = 0; p.vz = -p.vz * .3; p.vx *= .6; p.vy *= .6; }
            const at = project(p.x, p.y, p.z, this.p);
            p.node.setPosition(at.x, at.y);
            const size = Math.max(1, p.size * (1 + p.grow * k)) * at.s;
            if (p.flat) p.node.angle = 0; else p.node.angle += p.spin * dt;
            p.transform.setContentSize(size, p.flat ? size * DISC_SQUASH : size);
            this.scratch.set(p.tint); this.scratch.a = Math.round(255 * (1 - k * k) * (p.flat ? .8 : 1));
            p.sprite.color = this.scratch;
        }
    }

    private tickShake(dt: number): void {
        if (this.shake <= .05) { if (this.world.position.x !== 0 || this.world.position.y !== 0) this.world.setPosition(0, 0); return; }
        this.shakeTime += dt;
        this.shake *= Math.exp(-dt * 10);
        this.world.setPosition(Math.sin(this.shakeTime * 71) * this.shake * .6, Math.cos(this.shakeTime * 53) * this.shake);
    }
}

function idOf(node: Node): number { return Number(node.name.slice(5)); }
