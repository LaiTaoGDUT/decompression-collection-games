import {
    Color,
    Graphics,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec2,
} from 'cc';
import type {
    ProjectileModel,
    ProjectileOwner,
    ProjectileVisual,
} from '../core/CombatModels';
import type { ProjectileSystem } from '../systems/ProjectileSystem';

interface ProjectileActor {
    readonly node: Node;
    readonly transform: UITransform;
    readonly graphics: Graphics;
    readonly sprite: Sprite;
    generation: number;
    owner: ProjectileOwner;
    visual: ProjectileVisual;
}

const PROJECTILE_RECTS: Readonly<Record<Exclude<ProjectileVisual, 'enemy-arrow'>, Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}>>> = Object.freeze({
    'sword-blue': Object.freeze({ x: 0, y: 0, width: 256, height: 256 }),
    'sword-gold': Object.freeze({ x: 256, y: 0, width: 256, height: 256 }),
    'sword-silver': Object.freeze({ x: 512, y: 0, width: 256, height: 256 }),
    fireball: Object.freeze({ x: 0, y: 256, width: 256, height: 256 }),
    'poison-orb': Object.freeze({ x: 256, y: 256, width: 256, height: 256 }),
    'void-orb': Object.freeze({ x: 512, y: 256, width: 256, height: 256 }),
});
const PROJECTILE_VISUALS: readonly Exclude<ProjectileVisual, 'enemy-arrow'>[] = [
    'sword-blue',
    'sword-gold',
    'sword-silver',
    'fireball',
    'poison-orb',
    'void-orb',
];

/** 投射物节点固定预热；魔弩箭与 P0 玩家技能共用基础表现槽位。 */
export class ProjectileView {
    private readonly root: Node;
    private readonly actors: ProjectileActor[] = [];
    private readonly frames = new Map<Exclude<ProjectileVisual, 'enemy-arrow'>, SpriteFrame>();

    constructor(parent: Node, capacity: number, texture?: Texture2D) {
        this.root = new Node('Projectiles');
        this.root.layer = parent.layer;
        parent.addChild(this.root);
        if (texture) {
            for (const visual of PROJECTILE_VISUALS) {
                this.frames.set(visual, createAtlasFrame(texture, PROJECTILE_RECTS[visual]));
            }
        }
        for (let index = 0; index < capacity; index += 1) {
            const node = new Node(`Projectile-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            const transform = node.addComponent(UITransform);
            const graphics = node.addComponent(Graphics);
            graphics.enabled = false;
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.actors.push({
                node,
                transform,
                graphics,
                sprite,
                generation: -1,
                owner: 'enemy',
                visual: 'enemy-arrow',
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
            actor.sprite.spriteFrame = null;
        }
    }

    destroy(): void {
        for (const actor of this.actors) {
            actor.sprite.spriteFrame = null;
        }
        for (const frame of this.frames.values()) {
            if (frame.isValid) {
                frame.destroy();
            }
        }
        this.frames.clear();
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
        if (
            actor.generation !== projectile.generation
            || actor.owner !== projectile.owner
            || actor.visual !== projectile.visual
        ) {
            actor.generation = projectile.generation;
            actor.owner = projectile.owner;
            actor.visual = projectile.visual;
            actor.node.active = true;
            this.configureActor(actor, projectile);
        }
        actor.node.setPosition(
            projectile.prevX + (projectile.x - projectile.prevX) * alpha,
            projectile.prevY + (projectile.y - projectile.prevY) * alpha,
            0,
        );
        actor.node.angle = Math.atan2(projectile.velocityY, projectile.velocityX)
            * 180 / Math.PI;
    }

    private configureActor(actor: ProjectileActor, projectile: ProjectileModel): void {
        actor.transform.setContentSize(projectile.width, projectile.height);
        const frame = projectile.visual === 'enemy-arrow'
            ? undefined
            : this.frames.get(projectile.visual);
        actor.sprite.spriteFrame = frame ?? null;
        actor.sprite.enabled = Boolean(frame);
        actor.graphics.enabled = !frame;
        if (!frame) {
            drawProjectile(actor.graphics, projectile.owner, projectile.visual);
        }
    }
}

function createAtlasFrame(
    texture: Texture2D,
    rect: Readonly<{ x: number; y: number; width: number; height: number }>,
): SpriteFrame {
    const frame = new SpriteFrame();
    frame.texture = texture;
    frame.rect = new Rect(rect.x, rect.y, rect.width, rect.height);
    frame.originalSize = new Size(rect.width, rect.height);
    frame.offset = new Vec2(0, 0);
    return frame;
}

function drawProjectile(
    graphics: Graphics,
    owner: ProjectileOwner,
    visual: ProjectileVisual,
): void {
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
    graphics.strokeColor = visual === 'fireball'
        ? new Color(243, 107, 69, 255)
        : new Color(113, 207, 255, 255);
    graphics.lineWidth = 5;
    graphics.moveTo(-14, 0);
    graphics.lineTo(14, 0);
    graphics.stroke();
}
