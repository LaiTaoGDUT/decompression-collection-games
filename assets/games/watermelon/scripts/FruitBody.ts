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
    private readonly previousFluidPoints: Array<{ x: number; y: number }> = [];
    private readonly presentedFluidPoints: Array<{ x: number; y: number }> = [];
    private previousFluidX = 0;
    private previousFluidY = 0;

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
        visualOffsetX = 0,
        visualOffsetY = 0,
    ): void {
        if (points.length < 3) return;
        const visual = this.fluidSprite?.node ?? this.node.getChildByName('CatVisual');
        const sprite = this.fluidSprite ?? visual?.getComponent(WatermelonFluidSprite);
        if (!visual || !sprite) return;
        this.fluidSprite = sprite;
        visual.setPosition(visualOffsetX, visualOffsetY, 0);
        sprite.setFluidPoints(points, centerX, centerY);
        const scale = visual.scale;
        if (scale.x !== 1 || scale.y !== 1 || scale.z !== 1) visual.setScale(1, 1, 1);
    }

    /** Capture solved positions before each fixed step, never Verlet px/py:
     * those encode velocity and can be rewritten by collision constraints. */
    captureFluidShape(points: readonly { x: number; y: number }[], x: number, y: number): void {
        this.previousFluidX = x;
        this.previousFluidY = y;
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index];
            const previous = this.previousFluidPoints[index];
            if (previous) {
                previous.x = point.x;
                previous.y = point.y;
            } else {
                this.previousFluidPoints.push({ x: point.x, y: point.y });
                this.presentedFluidPoints.push({ x: point.x, y: point.y });
            }
        }
    }

    presentFluidShape(
        points: readonly { x: number; y: number }[],
        centerX: number,
        centerY: number,
        alpha: number,
    ): void {
        // A new merge result or restored fruit has no previous step yet.
        if (this.previousFluidPoints.length !== points.length) {
            this.applyFluidShape(points, centerX, centerY);
            return;
        }
        const x = this.previousFluidX + (centerX - this.previousFluidX) * alpha;
        const y = this.previousFluidY + (centerY - this.previousFluidY) * alpha;
        for (let index = 0; index < points.length; index += 1) {
            const previous = this.previousFluidPoints[index];
            const current = points[index];
            const target = this.presentedFluidPoints[index];
            target.x = previous.x + (current.x - previous.x) * alpha;
            target.y = previous.y + (current.y - previous.y) * alpha;
        }
        // Only the visual child is interpolated. Gameplay queries and saves
        // keep reading the authoritative fruit/solver position.
        this.applyFluidShape(this.presentedFluidPoints, x, y, x - centerX, y - centerY);
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
