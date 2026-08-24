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
import type { XpOrbModel } from '../core/CombatModels';
import type { XpOrbSystem } from '../systems/XpOrbSystem';

interface XpActor {
    readonly node: Node;
    readonly sprite: Sprite;
    readonly graphics: Graphics;
    readonly transform: UITransform;
    generation: number;
}

const XP_RECTS = [
    { x: 0, y: 0, width: 256, height: 256 },
    { x: 256, y: 0, width: 256, height: 256 },
    { x: 512, y: 0, width: 256, height: 256 },
    { x: 768, y: 0, width: 256, height: 256 },
] as const;
const XP_SIZES = [30, 38, 48, 60] as const;

/** XP 视图池：四级经验珠直接消费 pickups 图集，缺图时保留几何回退。 */
export class XpOrbView {
    private readonly root: Node;
    private readonly actors: XpActor[] = [];
    private readonly frames: SpriteFrame[] = [];

    constructor(parent: Node, capacity: number, texture?: Texture2D) {
        this.root = new Node('XpOrbs');
        this.root.layer = parent.layer;
        parent.addChild(this.root);
        if (texture) {
            for (const rect of XP_RECTS) {
                this.frames.push(createAtlasFrame(texture, rect));
            }
        }
        for (let index = 0; index < capacity; index += 1) {
            const node = new Node(`XpOrb-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            const transform = node.addComponent(UITransform);
            transform.setContentSize(XP_SIZES[0], XP_SIZES[0]);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.enabled = this.frames.length > 0;
            const graphics = node.addComponent(Graphics);
            graphics.enabled = this.frames.length === 0;
            if (this.frames.length === 0) {
                drawXpOrb(graphics, 1);
            }
            this.actors.push({ node, sprite, graphics, transform, generation: -1 });
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
        for (const frame of this.frames) {
            if (frame.isValid) {
                frame.destroy();
            }
        }
        this.frames.length = 0;
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
        const size = XP_SIZES[orb.tier - 1];
        actor.transform.setContentSize(size, size);
        if (this.frames.length > 0) {
            actor.sprite.spriteFrame = this.frames[orb.tier - 1];
        } else {
            drawXpOrb(actor.graphics, orb.tier);
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

function drawXpOrb(graphics: Graphics, tier: number): void {
    const radius = XP_SIZES[Math.max(1, Math.min(4, tier)) - 1] * 0.34;
    graphics.clear();
    graphics.fillColor = new Color(91, 232, 185, 80);
    graphics.circle(0, 0, radius * 1.35);
    graphics.fill();
    graphics.fillColor = new Color(255, 216, 106, 255);
    graphics.circle(0, 0, radius * 0.72);
    graphics.fill();
    graphics.strokeColor = new Color(231, 198, 106, 230);
    graphics.lineWidth = Math.max(2, radius * 0.18);
    graphics.circle(0, 0, radius);
    graphics.stroke();
}
