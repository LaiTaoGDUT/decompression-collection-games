import {
    _decorator,
    CircleCollider2D,
    Collider2D,
    Component,
    Contact2DType,
    ERigidBody2DType,
    Graphics,
    Node,
    RigidBody2D,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
} from 'cc';
import {
    CAT_TOKEN_VISIBLE_DIAMETER_RATIO,
    getFruitConfig,
} from './FruitCatalog';

const { ccclass, property } = _decorator;
const DANGER_SPAWN_GRACE_SECONDS = 0.7;
// Cocos 2D velocities are expressed in physics-world units. The previous
// 0.05 linear / 0.08 angular limits were below the solver's normal resting
// jitter, so a body could keep creeping forever without becoming eligible.
const SETTLE_LINEAR_SPEED_SQUARED = 0.1024;
const SETTLE_ANGULAR_SPEED = 0.65;
const SETTLE_DURATION_SECONDS = 0.65;

/** 单只圆滚滚猫咪的等级、圆形碰撞边界与内部动画。 */
@ccclass('FruitBody')
export class FruitBody extends Component {
    @property({ min: 0, max: 10, step: 1 })
    level = 0;

    private mergeLocked = false;
    private dropSequenceId = 0;
    private dropMergeCount = 0;
    private ageSeconds = 0;
    private enteredSafeZone = false;
    private animationFrames: readonly SpriteFrame[] = [];
    private idleFrameIndex = 0;
    private frameMode: 'idle' | 'fall' = 'idle';
    private hasPhysicalContact = false;
    private lowSpeedSeconds = 0;
    private collisionHandler?: (self: FruitBody, other: FruitBody) => void;

    protected onLoad(): void {
        this.applyConfig();
        this.node.getComponent(CircleCollider2D)?.on(
            Contact2DType.BEGIN_CONTACT,
            this.handleContact,
            this,
        );
    }

    protected onDestroy(): void {
        this.stopVisualAnimations();
        this.node.getComponent(CircleCollider2D)?.off(
            Contact2DType.BEGIN_CONTACT,
            this.handleContact,
            this,
        );
        this.collisionHandler = undefined;
    }

    protected update(deltaTime: number): void {
        if (Number.isFinite(deltaTime) && deltaTime > 0) {
            this.ageSeconds += deltaTime;
            this.updateNaturalSettle(deltaTime);
        }
    }

    /** Preserve landing inertia, then eliminate the solver's permanent micro-roll. */
    private updateNaturalSettle(deltaTime: number): void {
        if (!this.hasPhysicalContact || this.mergeLocked) {
            return;
        }

        const rigidBody = this.node.getComponent(RigidBody2D);
        if (!rigidBody || rigidBody.type !== ERigidBody2DType.Dynamic) {
            return;
        }
        if (!rigidBody.isAwake()) {
            this.lowSpeedSeconds = 0;
            return;
        }

        const velocity = rigidBody.linearVelocity;
        const speedSquared = velocity.x * velocity.x + velocity.y * velocity.y;
        if (speedSquared > SETTLE_LINEAR_SPEED_SQUARED
            || Math.abs(rigidBody.angularVelocity) > SETTLE_ANGULAR_SPEED) {
            this.lowSpeedSeconds = 0;
            return;
        }

        this.lowSpeedSeconds += deltaTime;
        if (this.lowSpeedSeconds < SETTLE_DURATION_SECONDS) {
            return;
        }

        rigidBody.linearVelocity = new Vec2(0, 0);
        rigidBody.angularVelocity = 0;
        rigidBody.sleep();
        this.lowSpeedSeconds = 0;
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

    /** A new fruit starts above the line and must not look like settled overflow. */
    canParticipateInDangerCheck(dangerY: number): boolean {
        const top = this.node.position.y + getFruitConfig(this.level).radius;
        if (top <= dangerY) {
            this.enteredSafeZone = true;
        }
        return this.enteredSafeZone || this.ageSeconds >= DANGER_SPAWN_GRACE_SECONDS;
    }

    setAnimationFrames(spriteFrames: readonly SpriteFrame[]): void {
        if (spriteFrames.length < 3) {
            throw new Error(`Cat level ${this.level} requires two idle frames and one fall frame.`);
        }
        this.animationFrames = spriteFrames;
        this.frameMode = 'idle';
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
            visual.addComponent(Sprite);
        }
        // The visible alpha circle now exactly matches the physical collider.
        const visualSize = config.radius * 2 / CAT_TOKEN_VISIBLE_DIAMETER_RATIO;
        const sprite = visual.getComponent(Sprite)!;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = spriteFrames[0];
        visual.getComponent(UITransform)?.setContentSize(visualSize, visualSize);
        this.clearFruitOutline();
        this.startIdleFrameAnimation();
    }

    private clearFruitOutline(): void {
        const ring = this.node.getChildByName('FruitOutline');
        ring?.getComponent(Graphics)?.clear();
        if (ring) {
            ring.active = false;
        }
    }

    playDropAnimation(): void {
        this.hasPhysicalContact = false;
        this.lowSpeedSeconds = 0;
        this.frameMode = 'fall';
        this.stopFrameAnimation();
        this.showFrame(2);
    }

    playCollisionAnimation(): void {
        this.frameMode = 'idle';
        this.startIdleFrameAnimation();
    }

    playMergeReveal(): void {
        this.frameMode = 'idle';
        this.stopFrameAnimation();
        this.showFrame(1);
        this.scheduleOnce(this.startIdleFrameAnimation, 0.18);
    }

    stopVisualAnimations(): void {
        this.stopFrameAnimation();
    }

    resumeIdleAnimation(): void {
        if (this.frameMode === 'fall') {
            this.showFrame(2);
        } else {
            this.startIdleFrameAnimation();
        }
    }

    private readonly startIdleFrameAnimation = (): void => {
        if (!this.node.isValid || this.mergeLocked || this.animationFrames.length < 2) {
            return;
        }
        this.stopFrameAnimation();
        this.idleFrameIndex = this.level % 2;
        this.showFrame(this.idleFrameIndex);
        this.schedule(this.advanceIdleFrame, 0.9 + (this.level % 3) * 0.1);
    };

    private readonly advanceIdleFrame = (): void => {
        this.idleFrameIndex = (this.idleFrameIndex + 1) % 2;
        this.showFrame(this.idleFrameIndex);
    };

    private stopFrameAnimation(): void {
        this.unschedule(this.advanceIdleFrame);
        this.unschedule(this.startIdleFrameAnimation);
    }

    private showFrame(index: number): void {
        const sprite = this.node.getChildByName('CatVisual')?.getComponent(Sprite);
        const frame = this.animationFrames[index];
        if (sprite && frame?.isValid) {
            sprite.spriteFrame = frame;
        }
    }

    setCollisionHandler(
        handler: (self: FruitBody, other: FruitBody) => void,
    ): void {
        this.collisionHandler = handler;
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
        }
    }

    private readonly handleContact = (
        _selfCollider: Collider2D,
        otherCollider: Collider2D,
    ): void => {
        if (this.mergeLocked) {
            return;
        }

        this.hasPhysicalContact = true;

        // The falling frame describes the airborne state, so any first
        // physical contact (floor, wall or another cat) ends it.
        if (this.frameMode === 'fall') {
            this.playCollisionAnimation();
        }

        const other = otherCollider.node.getComponent(FruitBody);

        if (other) {
            this.collisionHandler?.(this, other);
        }
    };
}
