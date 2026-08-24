import { Color, Graphics, Node } from 'cc';
import type { XpOrbModel } from '../core/CombatModels';
import type { XpOrbSystem } from '../systems/XpOrbSystem';

interface XpActor {
    readonly node: Node;
    generation: number;
}

/** XP 珠基础视图池；T1.7 在此扩展四级视觉，不改变池槽生命周期。 */
export class XpOrbView {
    private readonly root: Node;
    private readonly actors: XpActor[] = [];

    constructor(parent: Node, capacity: number) {
        this.root = new Node('XpOrbs');
        this.root.layer = parent.layer;
        parent.addChild(this.root);
        for (let index = 0; index < capacity; index += 1) {
            const node = new Node(`XpOrb-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            drawXpOrb(node.addComponent(Graphics));
            this.actors.push({ node, generation: -1 });
        }
    }

    sync(orbs: XpOrbSystem): void {
        orbs.forEachActive((orb) => this.render(orb));
    }

    hide(poolIndex: number): void {
        const actor = this.actors[poolIndex];
        if (actor) {
            actor.node.active = false;
        }
    }

    resetAll(): void {
        for (const actor of this.actors) {
            actor.node.active = false;
            actor.generation = -1;
        }
    }

    destroy(): void {
        this.actors.length = 0;
        if (this.root.isValid) {
            this.root.destroy();
        }
    }

    private render(orb: XpOrbModel): void {
        const actor = this.actors[orb.poolIndex];
        if (!actor) {
            return;
        }
        if (actor.generation !== orb.generation) {
            actor.generation = orb.generation;
            actor.node.active = true;
        }
        actor.node.setPosition(orb.x, orb.y, 0);
    }
}

function drawXpOrb(graphics: Graphics): void {
    graphics.fillColor = new Color(91, 232, 185, 80);
    graphics.circle(0, 0, 11);
    graphics.fill();
    graphics.fillColor = new Color(172, 255, 221, 255);
    graphics.circle(0, 0, 6);
    graphics.fill();
    graphics.strokeColor = new Color(231, 198, 106, 220);
    graphics.lineWidth = 2;
    graphics.circle(0, 0, 7);
    graphics.stroke();
}
