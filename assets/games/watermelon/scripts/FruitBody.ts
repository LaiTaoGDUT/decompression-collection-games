import {
    _decorator,
    CircleCollider2D,
    Component,
    ERigidBody2DType,
    Graphics,
    Node,
    RigidBody2D,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import {
    CAT_TOKEN_VISIBLE_DIAMETER_RATIO,
    getFruitConfig,
} from './FruitCatalog';
import { WatermelonFluidSprite } from './WatermelonFluidSprite';

const { ccclass, property } = _decorator;

/** 单颗圆形水果的等级、圆形碰撞边界与单帧视觉。 */
@ccclass('FruitBody')
export class FruitBody extends Component {
    @property({ min: 0, max: 10, step: 1 })
    level = 0;

    private mergeLocked = false;
    private dropSequenceId = 0;
    private dropMergeCount = 0;
    private fluidSprite?: WatermelonFluidSprite;

    protected onLoad(): void {
        this.applyConfig();
    }

    get isMergeLocked(): boolean {
        return this.mergeLocked;
    }

    get sourceDropSequenceId(): number {
        return this.dropSequenceId;
    }

    get sourceDropMergeCount(): number {
        return this.dropMergeCount;
    }

    /** Track only the current player's drop and descendants created by it. */
    setDropChain(sequenceId: number, mergeCount: number): void {
        this.dropSequenceId = Math.max(0, Math.floor(sequenceId));
        this.dropMergeCount = Math.max(0, Math.floor(mergeCount));
    }

    setSpriteFrame(spriteFrame: SpriteFrame): void {
        if (!spriteFrame?.isValid) {
            throw new Error(`Cat level ${this.level} has no valid daily sprite frame.`);
        }
        const config = getFruitConfig(this.level);
        const graphics = this.node.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
        }

        let visual = this.node.getChildByName('CatVisual');
        if (!visual) {
            visual = new Node('CatVisual');
            visual.layer = this.node.layer;
            visual.setParent(this.node);
            visual.addComponent(UITransform);
            visual.addComponent(WatermelonFluidSprite);
        }
        // The visible token and CircleCollider2D use the same physical diameter.
        const visualSize = config.radius * 2 / CAT_TOKEN_VISIBLE_DIAMETER_RATIO;
        const sprite = visual.getComponent(WatermelonFluidSprite)!;
        this.fluidSprite = sprite;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = spriteFrame;
        visual.getComponent(UITransform)?.setContentSize(visualSize, visualSize);
    }

    applyFluidShape(
        points: readonly { x: number; y: number }[],
        centerX: number,
        centerY: number,
    ): void {
        if (points.length < 3) return;
        const visual = this.fluidSprite?.node ?? this.node.getChildByName('CatVisual');
        const sprite = this.fluidSprite ?? visual?.getComponent(WatermelonFluidSprite);
        if (!visual || !sprite) return;
        this.fluidSprite = sprite;
        sprite.setFluidPoints(points, centerX, centerY);
        visual.setScale(1, 1, 1);
    }

    lockForMerge(): boolean {
        if (this.mergeLocked || !this.node.isValid) {
            return false;
        }

        this.mergeLocked = true;
        const collider = this.node.getComponent(CircleCollider2D);
        const rigidBody = this.node.getComponent(RigidBody2D);

        if (collider) {
            collider.enabled = false;
        }

        if (rigidBody) {
            rigidBody.enabled = false;
        }

        return true;
    }

    unlockAfterCancelledMerge(): void {
        if (!this.mergeLocked || !this.node.isValid) {
            return;
        }

        this.mergeLocked = false;
        const collider = this.node.getComponent(CircleCollider2D);
        const rigidBody = this.node.getComponent(RigidBody2D);

        if (collider) {
            collider.enabled = true;
        }
        if (rigidBody) {
            rigidBody.enabled = true;
        }
    }

    applyConfig(): void {
        const config = getFruitConfig(this.level);
        const diameter = config.radius * 2;
        this.node.getComponent(UITransform)?.setContentSize(diameter, diameter);

        const graphics = this.node.getComponent(Graphics);

        if (graphics) {
            graphics.clear();
        }

        const collider = this.node.getComponent(CircleCollider2D);

        if (collider) {
            collider.radius = config.radius;
            collider.density = config.density;
            collider.friction = config.friction;
            collider.restitution = config.restitution;
            collider.apply();
        }

        const rigidBody = this.node.getComponent(RigidBody2D);

        if (rigidBody) {
            // Physical contacts are resolved even when contact reporting is
            // disabled, but BEGIN_CONTACT is not emitted. Merging depends on
            // that callback, so every runtime fruit must opt in explicitly.
            rigidBody.enabledContactListener = true;
            rigidBody.type = ERigidBody2DType.Dynamic;
            rigidBody.gravityScale = config.gravityScale;
            rigidBody.linearDamping = config.linearDamping;
            rigidBody.angularDamping = config.angularDamping;
            rigidBody.bullet = config.radius <= 38;
            // Movement and collision are owned exclusively by the soft-body
            // world. The legacy Cocos body remains serialized only for prefab
            // compatibility and never participates at runtime.
            rigidBody.enabled = false;
        }
    }

}
