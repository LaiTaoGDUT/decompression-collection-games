import {
    _decorator,
    CircleCollider2D,
    Collider2D,
    Color,
    Component,
    Contact2DType,
    ERigidBody2DType,
    Graphics,
    Node,
    RigidBody2D,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UITransform,
    Vec3,
} from 'cc';
import { getFruitConfig } from './FruitCatalog';

const { ccclass, property } = _decorator;
const DANGER_SPAWN_GRACE_SECONDS = 0.7;

/** 单个水果 Prefab 的等级和物理外观配置；不包含生成或合成逻辑。 */
@ccclass('FruitBody')
export class FruitBody extends Component {
    @property({ min: 0, max: 10, step: 1 })
    level = 0;

    private mergeLocked = false;
    private mergeChainDepth = 0;
    private ageSeconds = 0;
    private enteredSafeZone = false;
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
        }
    }

    get isMergeLocked(): boolean {
        return this.mergeLocked;
    }

    get chainDepth(): number {
        return this.mergeChainDepth;
    }

    setChainDepth(depth: number): void {
        this.mergeChainDepth = Math.max(0, Math.floor(depth));
    }

    /** A new fruit starts above the line and must not look like settled overflow. */
    canParticipateInDangerCheck(dangerY: number): boolean {
        const top = this.node.position.y + getFruitConfig(this.level).radius;
        if (top <= dangerY) {
            this.enteredSafeZone = true;
        }
        return this.enteredSafeZone || this.ageSeconds >= DANGER_SPAWN_GRACE_SECONDS;
    }

    setSpriteFrame(spriteFrame: SpriteFrame): void {
        const config = getFruitConfig(this.level);
        const graphics = this.node.getComponent(Graphics);
        if (graphics) {
            graphics.clear();
        }

        let visual = this.node.getChildByName('PaperFruitVisual');
        if (!visual) {
            visual = new Node('PaperFruitVisual');
            visual.layer = this.node.layer;
            visual.setParent(this.node);
            visual.addComponent(UITransform);
            visual.addComponent(Sprite);
        }
        const visualSize = config.radius * 2.08;
        const sprite = visual.getComponent(Sprite)!;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = spriteFrame;
        visual.getComponent(UITransform)?.setContentSize(visualSize, visualSize);
        this.drawFruitOutline(config.radius);
    }

    private drawFruitOutline(radius: number): void {
        let ring = this.node.getChildByName('FruitOutline');
        if (!ring) {
            ring = new Node('FruitOutline');
            ring.layer = this.node.layer;
            ring.setParent(this.node);
            ring.addComponent(UITransform);
            ring.addComponent(Graphics);
        }
        ring.active = true;
        ring.setSiblingIndex(this.node.children.length - 1);
        ring.getComponent(UITransform)?.setContentSize(radius * 2.08, radius * 2.08);
        const graphics = ring.getComponent(Graphics)!;
        graphics.clear();
        graphics.strokeColor = new Color(75, 43, 32, 255);
        graphics.lineWidth = Math.max(4, radius * 0.055);
        graphics.circle(0, 0, radius * 0.985);
        graphics.stroke();
        graphics.strokeColor = new Color(255, 242, 214, 185);
        graphics.lineWidth = Math.max(1.5, radius * 0.016);
        graphics.circle(0, 0, radius * 0.93);
        graphics.stroke();
    }

    playDropAnimation(): void {
        const visual = this.node.getChildByName('PaperFruitVisual');
        if (!visual) return;
        Tween.stopAllByTarget(visual);
        visual.setScale(0.82, 0.82, 1);
        tween(visual).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }

    playCollisionAnimation(): void {
        const visual = this.node.getChildByName('PaperFruitVisual');
        if (!visual) return;
        Tween.stopAllByTarget(visual);
        visual.setScale(0.96, 1.03, 1);
        tween(visual).to(0.08, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }

    playMergeReveal(chainDepth: number): void {
        const visual = this.node.getChildByName('PaperFruitVisual');
        if (!visual) return;
        Tween.stopAllByTarget(visual);
        visual.setScale(0.36, 0.18, 1);
        tween(visual)
            .to(0.13, { scale: new Vec3(1.08, 0.82, 1) }, { easing: 'quadOut' })
            .to(chainDepth >= 2 ? 0.18 : 0.13, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    stopVisualAnimations(): void {
        const visual = this.node.getChildByName('PaperFruitVisual');
        if (visual) {
            Tween.stopAllByTarget(visual);
            visual.setScale(1, 1, 1);
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
            graphics.fillColor = new Color(
                config.color.r,
                config.color.g,
                config.color.b,
                255,
            );
            graphics.strokeColor = new Color(255, 255, 255, 220);
            graphics.lineWidth = 4;
            graphics.circle(0, 0, config.radius);
            graphics.fill();
            graphics.stroke();
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

        const other = otherCollider.node.getComponent(FruitBody);

        if (other) {
            this.collisionHandler?.(this, other);
        }
    };
}
