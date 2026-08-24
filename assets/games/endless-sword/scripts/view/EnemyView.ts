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
import {
    ENEMY_TYPES,
    getEnemyConfig,
    type EnemyType,
} from '../config/EnemyConfig';
import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { EnemyModel } from '../core/CombatModels';
import type { EnemySystem } from '../systems/EnemySystem';

export type EnemyTextureSet = Readonly<Partial<Record<EnemyType, Texture2D>>>;

interface EnemyActor {
    readonly node: Node;
    readonly shadow: Node;
    readonly shadowGraphics: Graphics;
    readonly body: Node;
    readonly sprite: Sprite;
    readonly placeholder: Graphics;
    readonly opacity: UIOpacity;
    generation: number;
    type: EnemyType;
    animationTime: number;
}

interface EnemyShadowLayout {
    readonly radiusX: number;
    readonly radiusY: number;
    /** 相对 hurtbox 脚底的纵向偏移，负数向下。 */
    readonly offsetY: number;
}

const NORMAL_TINT = new Color(255, 255, 255, 255);
const HIT_TINT = new Color(255, 226, 226, 255);
const GROUND_SHADOW = ENDLESS_SWORD_CONFIG.groundShadowColor;
const SHADOW_COLOR = new Color(
    GROUND_SHADOW.red,
    GROUND_SHADOW.green,
    GROUND_SHADOW.blue,
    GROUND_SHADOW.alpha,
);
const ENEMY_SHADOW_LAYOUTS: Readonly<Record<EnemyType, EnemyShadowLayout>> = Object.freeze({
    'demon-rat': Object.freeze({ radiusX: 26, radiusY: 8, offsetY: -8 }),
    'ghost-flame': Object.freeze({ radiusX: 22, radiusY: 7, offsetY: -17 }),
    'rotting-corpse': Object.freeze({ radiusX: 22, radiusY: 7, offsetY: -13 }),
    'crossbow-puppet': Object.freeze({ radiusX: 22, radiusY: 7, offsetY: -22 }),
});
const FALLBACK_COLORS: Readonly<Record<EnemyType, Color>> = Object.freeze({
    'demon-rat': new Color(93, 118, 108, 255),
    'ghost-flame': new Color(65, 225, 177, 255),
    'rotting-corpse': new Color(122, 134, 113, 255),
    'crossbow-puppet': new Color(116, 74, 70, 255),
});

/** 160 个敌人节点在 initialize 阶段一次性预热；游戏中只切换槽位和 SpriteFrame。 */
export class EnemyView {
    private readonly root: Node;
    private readonly actors: EnemyActor[] = [];
    private readonly frames: Record<EnemyType, SpriteFrame[]> = {
        'demon-rat': [],
        'ghost-flame': [],
        'rotting-corpse': [],
        'crossbow-puppet': [],
    };

    constructor(parent: Node, capacity: number, textures: EnemyTextureSet) {
        this.root = new Node('Enemies');
        this.root.layer = parent.layer;
        parent.addChild(this.root);

        for (const type of ENEMY_TYPES) {
            const texture = textures[type];
            if (texture) {
                this.frames[type] = buildEnemyFrames(type, texture);
            }
        }

        for (let index = 0; index < capacity; index += 1) {
            this.actors.push(this.createActor(index));
        }
    }

    sync(enemies: EnemySystem, alpha: number, frameSeconds: number): void {
        enemies.forEachActive((enemy) => this.renderEnemy(enemy, alpha, frameSeconds));
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
        for (const actor of this.actors) {
            actor.sprite.spriteFrame = null;
        }
        for (const type of ENEMY_TYPES) {
            for (const frame of this.frames[type]) {
                if (frame.isValid) {
                    frame.destroy();
                }
            }
            this.frames[type].length = 0;
        }
        this.actors.length = 0;
        if (this.root.isValid) {
            this.root.destroy();
        }
    }

    private createActor(index: number): EnemyActor {
        const node = new Node(`Enemy-${index}`);
        node.layer = this.root.layer;
        node.active = false;
        this.root.addChild(node);
        const opacity = node.addComponent(UIOpacity);

        const placeholder = node.addComponent(Graphics);
        placeholder.enabled = false;

        const shadow = new Node('Shadow');
        shadow.layer = node.layer;
        node.addChild(shadow);
        const shadowGraphics = shadow.addComponent(Graphics);

        const body = new Node('Body');
        body.layer = node.layer;
        node.addChild(body);
        body.addComponent(UITransform).setContentSize(1, 1);
        const sprite = body.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;

        return {
            node,
            shadow,
            shadowGraphics,
            body,
            sprite,
            placeholder,
            opacity,
            generation: -1,
            type: 'demon-rat',
            animationTime: 0,
        };
    }

    private renderEnemy(enemy: EnemyModel, alpha: number, frameSeconds: number): void {
        const actor = this.actors[enemy.poolIndex];
        if (!actor) {
            return;
        }
        if (actor.generation !== enemy.generation) {
            this.configureActor(actor, enemy);
        }

        const x = enemy.state === 'alive'
            ? enemy.prevX + (enemy.x - enemy.prevX) * alpha
            : enemy.x;
        const y = enemy.state === 'alive'
            ? enemy.prevY + (enemy.y - enemy.prevY) * alpha
            : enemy.y;
        actor.node.setPosition(x, y, 0);

        if (enemy.state === 'dying') {
            const progress = Math.min(
                1,
                enemy.deathElapsed / ENDLESS_SWORD_CONFIG.combat.enemyDeathSeconds,
            );
            const scale = progress < 0.35
                ? 1 + 0.15 * (progress / 0.35)
                : 1.15 * (1 - (progress - 0.35) / 0.65);
            actor.node.setScale(Math.max(0, scale), Math.max(0, scale), 1);
            actor.node.angle = enemy.deathRotation * progress;
            actor.opacity.opacity = Math.round(255 * (1 - progress));
            return;
        }

        actor.node.setScale(1, 1, 1);
        actor.node.angle = 0;
        actor.opacity.opacity = 255;
        actor.body.setScale(enemy.facingX < 0 ? -1 : 1, 1, 1);
        positionEnemyShadow(actor.shadow, enemy.type, enemy.facingX);
        actor.sprite.color = enemy.hitFlashRemaining > 0 ? HIT_TINT : NORMAL_TINT;

        const frames = this.frames[enemy.type];
        if (frames.length > 0) {
            actor.animationTime += frameSeconds;
            const config = getEnemyConfig(enemy.type).sprite;
            const frameIndex = Math.floor(actor.animationTime * config.framesPerSecond)
                % config.frameCount;
            actor.sprite.spriteFrame = frames[frameIndex];
        }
    }

    private configureActor(actor: EnemyActor, enemy: EnemyModel): void {
        const config = getEnemyConfig(enemy.type).sprite;
        const frames = this.frames[enemy.type];
        actor.generation = enemy.generation;
        actor.type = enemy.type;
        actor.animationTime = 0;
        actor.node.active = true;
        actor.node.setScale(1, 1, 1);
        actor.node.angle = 0;
        actor.opacity.opacity = 255;
        actor.body.setScale(enemy.facingX < 0 ? -1 : 1, 1, 1);
        drawEnemyShadow(actor.shadowGraphics, enemy.type);
        positionEnemyShadow(actor.shadow, enemy.type, enemy.facingX);
        actor.body.getComponent(UITransform)?.setContentSize(
            config.frameWidth * config.displayScale,
            config.frameHeight * config.displayScale,
        );
        actor.sprite.enabled = frames.length > 0;
        actor.sprite.spriteFrame = frames[0] ?? null;
        actor.placeholder.enabled = frames.length === 0;
        if (frames.length === 0) {
            drawFallback(actor.placeholder, enemy.type);
        }
    }
}

function drawEnemyShadow(graphics: Graphics, type: EnemyType): void {
    const layout = ENEMY_SHADOW_LAYOUTS[type];
    graphics.clear();
    graphics.fillColor = SHADOW_COLOR;
    graphics.ellipse(0, 0, layout.radiusX, layout.radiusY);
    graphics.fill();
}

function positionEnemyShadow(node: Node, type: EnemyType, facingX: number): void {
    const sprite = getEnemyConfig(type).sprite;
    const sourceCenterX = sprite.hurtbox.x + sprite.hurtbox.width * 0.5
        - sprite.frameWidth * 0.5;
    const sourceFeetY = sprite.frameHeight * 0.5
        - sprite.hurtbox.y
        - sprite.hurtbox.height;
    const layout = ENEMY_SHADOW_LAYOUTS[type];
    node.setPosition(
        sourceCenterX * sprite.displayScale * (facingX < 0 ? -1 : 1),
        sourceFeetY * sprite.displayScale + layout.offsetY,
        0,
    );
}

function buildEnemyFrames(type: EnemyType, texture: Texture2D): SpriteFrame[] {
    const config = getEnemyConfig(type).sprite;
    const requiredWidth = config.frameWidth * config.frameCount;
    if (texture.width < requiredWidth || texture.height < config.frameHeight) {
        throw new Error(
            `${type} texture is ${texture.width}x${texture.height}, expected at least `
            + `${requiredWidth}x${config.frameHeight}.`,
        );
    }
    const frames: SpriteFrame[] = [];
    for (let column = 0; column < config.frameCount; column += 1) {
        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(
            column * config.frameWidth,
            0,
            config.frameWidth,
            config.frameHeight,
        );
        frame.originalSize = new Size(config.frameWidth, config.frameHeight);
        frame.offset = new Vec2(0, 0);
        frames.push(frame);
    }
    return frames;
}

function drawFallback(graphics: Graphics, type: EnemyType): void {
    graphics.clear();
    graphics.fillColor = FALLBACK_COLORS[type];
    graphics.circle(0, 0, 34);
    graphics.fill();
    graphics.strokeColor = new Color(16, 24, 23, 255);
    graphics.lineWidth = 3;
    graphics.circle(0, 0, 34);
    graphics.stroke();
}
