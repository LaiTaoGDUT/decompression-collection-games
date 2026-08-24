import {
    Color,
    Graphics,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
    UIOpacity,
    UITransform,
    Vec2,
} from 'cc';
import type { SkillVfxId } from '../config/SkillConfig';
import type { SkillEffectEvent, SkillSystem } from '../systems/SkillSystem';

interface EffectActor {
    readonly node: Node;
    readonly sprite: Sprite;
    readonly graphics: Graphics;
    readonly opacity: UIOpacity;
    remainingSeconds: number;
}

const VFX_RECTS: Readonly<Record<SkillVfxId, Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}>>> = Object.freeze({
    'hit-spark': Object.freeze({ x: 0, y: 0, width: 256, height: 256 }),
    'sword-slash': Object.freeze({ x: 256, y: 0, width: 256, height: 256 }),
    lightning: Object.freeze({ x: 512, y: 0, width: 256, height: 256 }),
    'fire-explode': Object.freeze({ x: 768, y: 0, width: 256, height: 256 }),
    'fire-field': Object.freeze({ x: 0, y: 256, width: 256, height: 256 }),
});
const VFX_IDS: readonly SkillVfxId[] = [
    'hit-spark',
    'sword-slash',
    'lightning',
    'fire-explode',
    'fire-field',
];

/**
 * P0 技能表现层：固定预热 24 个 VFX 槽位和 4 个环绕剑槽位，
 * 只订阅 SkillSystem 的事件与可视状态，不参与伤害或 CD 判定。
 */
export class SkillView {
    private readonly root: Node;
    private readonly effects: EffectActor[] = [];
    private readonly orbitNodes: Node[] = [];
    private readonly vfxFrames = new Map<SkillVfxId, SpriteFrame>();
    private readonly orbitFrame?: SpriteFrame;

    constructor(
        parent: Node,
        vfxTexture: Texture2D | undefined,
        projectileTexture: Texture2D | undefined,
        effectCapacity = 24,
    ) {
        this.root = new Node('SkillView');
        this.root.layer = parent.layer;
        parent.addChild(this.root);

        if (vfxTexture) {
            for (const id of VFX_IDS) {
                this.vfxFrames.set(id, createAtlasFrame(vfxTexture, VFX_RECTS[id]));
            }
        }
        if (projectileTexture) {
            this.orbitFrame = createAtlasFrame(
                projectileTexture,
                { x: 0, y: 0, width: 256, height: 256 },
            );
        }

        for (let index = 0; index < effectCapacity; index += 1) {
            const node = new Node(`SkillEffect-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            node.addComponent(UITransform).setContentSize(256, 256);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const graphics = node.addComponent(Graphics);
            graphics.enabled = false;
            const opacity = node.addComponent(UIOpacity);
            this.effects.push({
                node,
                sprite,
                graphics,
                opacity,
                remainingSeconds: 0,
            });
        }

        for (let index = 0; index < 4; index += 1) {
            const node = new Node(`OrbitBlade-${index}`);
            node.layer = this.root.layer;
            node.active = false;
            this.root.addChild(node);
            node.addComponent(UITransform).setContentSize(76, 28);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.orbitFrame ?? null;
            sprite.enabled = Boolean(this.orbitFrame);
            if (!this.orbitFrame) {
                drawOrbitFallback(node.addComponent(Graphics));
            }
            this.orbitNodes.push(node);
        }
    }

    sync(skillSystem: SkillSystem, frameSeconds: number): void {
        for (const actor of this.effects) {
            if (!actor.node.active) {
                continue;
            }
            actor.remainingSeconds -= frameSeconds;
            if (actor.remainingSeconds <= 0) {
                actor.node.active = false;
                continue;
            }
            actor.opacity.opacity = Math.round(
                255 * Math.min(1, actor.remainingSeconds / 0.08),
            );
        }

        const blades = skillSystem.getOrbitBlades();
        for (let index = 0; index < this.orbitNodes.length; index += 1) {
            const node = this.orbitNodes[index];
            const blade = blades[index];
            if (!blade?.active) {
                node.active = false;
                continue;
            }
            node.active = true;
            node.setPosition(blade.x, blade.y, 0);
            node.angle = blade.angle;
            node.getComponent(UITransform)?.setContentSize(blade.width, blade.height);
        }
    }

    emit(event: SkillEffectEvent): void {
        const actor = this.effects.find((candidate) => !candidate.node.active);
        if (!actor) {
            return;
        }
        actor.node.active = true;
        actor.node.setPosition(event.x, event.y, 0);
        actor.node.setScale(event.scale, event.scale, 1);
        actor.node.angle = event.angle ?? 0;
        actor.remainingSeconds = event.durationSeconds;
        actor.opacity.opacity = 255;
        const frame = this.vfxFrames.get(event.vfx);
        actor.sprite.spriteFrame = frame ?? null;
        actor.sprite.enabled = Boolean(frame);
        actor.graphics.enabled = !frame;
        if (!frame) {
            drawEffectFallback(actor.graphics, event.vfx);
        }
    }

    resetAll(): void {
        for (const actor of this.effects) {
            actor.node.active = false;
            actor.remainingSeconds = 0;
        }
        for (const node of this.orbitNodes) {
            node.active = false;
        }
    }

    destroy(): void {
        for (const frame of this.vfxFrames.values()) {
            if (frame.isValid) {
                frame.destroy();
            }
        }
        this.vfxFrames.clear();
        if (this.orbitFrame?.isValid) {
            this.orbitFrame.destroy();
        }
        this.effects.length = 0;
        this.orbitNodes.length = 0;
        if (this.root.isValid) {
            this.root.destroy();
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

function drawEffectFallback(graphics: Graphics, vfx: SkillVfxId): void {
    graphics.clear();
    graphics.lineWidth = 5;
    graphics.strokeColor = vfx === 'lightning'
        ? new Color(167, 123, 243, 220)
        : vfx === 'fire-explode'
            ? new Color(243, 107, 69, 220)
            : new Color(113, 207, 255, 220);
    graphics.circle(0, 0, 44);
    graphics.stroke();
}

function drawOrbitFallback(graphics: Graphics): void {
    graphics.clear();
    graphics.strokeColor = new Color(113, 207, 255, 255);
    graphics.lineWidth = 5;
    graphics.moveTo(-32, 0);
    graphics.lineTo(32, 0);
    graphics.stroke();
}
