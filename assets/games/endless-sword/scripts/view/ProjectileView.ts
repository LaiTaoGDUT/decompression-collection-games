import { Color, Graphics, Node } from 'cc';
import type { ProjectileModel, ProjectileOwner } from '../core/CombatModels';
import type { ProjectileSystem } from '../systems/ProjectileSystem';

interface ProjectileActor {
    readonly node: Node;
    readonly graphics: Graphics;
    generation: number;
    owner: ProjectileOwner;
}

/** 投射物节点固定预热；魔弩箭与 T1.6 玩家技能共用基础表现槽位。 */
export class ProjectileView {
    private readonly root: Node;
    private readonly actors: ProjectileActor[] = [];

    constructor(parent: Node, capacity: number) {
        this.root = new Node('Projectiles');
        this.root.layer = parent.layer;
        parent.addChild(this.root);
        for (let index = 0; index < capacity; index += 1) {
            const node = new Node(`Projectile-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            this.actors.push({
                node,
                graphics: node.addComponent(Graphics),
                generation: -1,
                owner: 'enemy',
            });
        }
    }

    sync(projectiles: ProjectileSystem, alpha: number): void {
        projectiles.forEachActive((projectile) => this.render(projectile, alpha));
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

    private render(projectile: ProjectileModel, alpha: number): void {
        const actor = this.actors[projectile.poolIndex];
        if (!actor) {
            return;
        }
        if (projectile.expired) {
            actor.node.active = false;
            return;
        }
        if (actor.generation !== projectile.generation || actor.owner !== projectile.owner) {
            actor.generation = projectile.generation;
            actor.owner = projectile.owner;
            actor.node.active = true;
            drawProjectile(actor.graphics, projectile.owner);
        }
        actor.node.setPosition(
            projectile.prevX + (projectile.x - projectile.prevX) * alpha,
            projectile.prevY + (projectile.y - projectile.prevY) * alpha,
            0,
        );
        actor.node.angle = Math.atan2(projectile.velocityY, projectile.velocityX)
            * 180 / Math.PI;
    }
}

function drawProjectile(graphics: Graphics, owner: ProjectileOwner): void {
    graphics.clear();
    if (owner === 'enemy') {
        graphics.strokeColor = new Color(65, 33, 28, 255);
        graphics.fillColor = new Color(226, 91, 69, 255);
        graphics.lineWidth = 4;
        graphics.moveTo(-14, 0);
        graphics.lineTo(12, 0);
        graphics.stroke();
        graphics.moveTo(14, 0);
        graphics.lineTo(6, 5);
        graphics.lineTo(6, -5);
        graphics.close();
        graphics.fill();
        return;
    }
    graphics.strokeColor = new Color(202, 236, 225, 255);
    graphics.lineWidth = 5;
    graphics.moveTo(-14, 0);
    graphics.lineTo(14, 0);
    graphics.stroke();
}
