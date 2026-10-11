import {
    CircleCollider2D, Collider2D, Color, Contact2DType, DistanceJoint2D, ERigidBody2DType,
    FixedJoint2D, Graphics, HingeJoint2D, Joint2D, Mask, Node, PhysicsSystem2D,
    PolygonCollider2D, RigidBody2D, SliderJoint2D, SpringJoint2D, Sprite, SpriteFrame, UIOpacity, UITransform, Vec2, Vec3,
} from 'cc';
import type { IPhysics2DContact } from 'cc';
import type { CyBlockBeesElement, CyBlockBeesLevel } from './CyBlockBeesLevels';
import { CYBLOCKBEES_ENVIRONMENT } from './CyBlockBeesLevels';
import type { CyBlockBeesPrefab } from './CyBlockBeesPrefab';
import { buildDrawnLine, buildDrawnSpine, DrawnSpineCache } from './CyBlockBeesSpline';
import { CyBlockBeesStrokeCollider2D } from './CyBlockBeesStrokeCollider2D';
import { CYBLOCKBEES_KIND_SPRITES, CYBLOCKBEES_RULES } from './CyBlockBeesTheme';

const UNIT = 100, PTM = 32, DEG = 180 / Math.PI, LINE_WIDTH = .148796886, MAX_ROPE_PARTICLES = 6;
const INK = new Color(20, 19, 18, 255);
const ROPE_COLOR = new Color(49, 40, 28);
// Box2D 的过滤位是 uint16，Unity 的 layer 编号不能直接用于高于 15 的位。
const GROUP = { solid: 16, bee: 32, hive: 64, ground: 128, line: 256, spike: 512, mass: 1024 };
const ALL_GROUPS = 16 | 32 | 64 | 128 | 256 | 512;
const BEE_PATH = [.0675, .1442, -.2603, .1573, -.7224, .0700, -.5150, -.2271,
    -.3543, -.3717, -.0845, -.4796, .3525, -.4284, .7059, -.1199, .4785, .0235];
type Fixture = CyBlockBeesPrefab['colliders'][number];
type JointData = CyBlockBeesPrefab['joints'][number];
type DogPose = 'dog-idle' | 'dog-scared' | 'dog-beaten' | 'dog-win' | 'dog-lose';
interface Actor {
    node: Node; element?: CyBlockBeesElement; kind: string; body: RigidBody2D;
    colliders: Collider2D[]; fixtures: readonly Fixture[]; sprite?: Sprite; visualRoot?: Node; mass: number;
    alive: boolean; hurt: number; grace: number; age: number; cooldown: number; origin: Vec2;
    mode: number; rope?: Node[]; ropeJoints?: Joint2D[]; ropeParticle?: boolean; joints: Joint2D[]; line?: Vec2[];
    dogPose?: DogPose;
    physicsScale?: Vec3;
    bee?: { phase: 'fly' | 'seek' | 'back' | 'dead'; time: number; direction: number; removeAfter: number;
        ignoredHives: readonly Node[]; contacts: Map<Node, Set<IPhysics2DContact>>; processed: Set<Node> };
}
interface PathBounds { minX: number; minY: number; maxX: number; maxY: number; }
interface ActorPaths {
    fixtures: readonly Fixture[]; local: Vec2[][]; world: Vec2[][]; planningWorld: Vec2[][]; sensorWorld: Vec2[][];
    localBounds: PathBounds; bounds: PathBounds; coarseBounds: PathBounds;
    x: number; y: number; sx: number; sy: number; angle: number;
}
interface DrawingGuide {
    root: Node; stroke: Graphics; finger: Node; opacity: UIOpacity; points: Vec2[]; time: number;
}
export interface CyBlockBeesBoardCallbacks {
    onDogStung(element: CyBlockBeesElement, cause: string): void;
    onDogHurt?(): void;
    onBeeHitLine(): void;
    onBeeHitObstacle(element: CyBlockBeesElement): void;
    onBeeEnterWater(): void;
    onExplosion?(): void;
}

/** 原 prefab 的复合刚体、关节和渲染尺寸。线具有质量和重力，必须由地形承托。 */
export class CyBlockBeesBoard {
    readonly root: Node;
    private readonly actors: Actor[] = [];
    private readonly environment: Actor[] = [];
    private readonly sceneActors: Actor[] = [];
    private readonly dogs: Actor[] = [];
    private readonly boxes: Actor[] = [];
    private readonly forceActors: Actor[] = [];
    private readonly ropeActors: Actor[] = [];
    private readonly byNode = new Map<Node, Actor>();
    private readonly fixtureByCollider = new Map<Collider2D, Fixture>();
    private readonly bees: Actor[] = [];
    private readonly lines: Actor[] = [];
    private readonly contactForces: { actor: Actor; force: Vec2; duration: number }[] = [];
    private readonly deferred: (() => void)[] = [];
    private readonly originalMatrix = new Map<number, number>();
    private readonly physicsBefore: { enabled: boolean; auto: boolean; gravity: Vec2;
        fixedTimeStep: number; velocityIterations: number; positionIterations: number };
    private readonly restoreBroadPhase: () => void;
    private draft: Graphics;
    private ropes: Graphics;
    private spriteOf: (slug: string) => SpriteFrame | undefined = () => undefined;
    private scale = 1;
    private centerX = 0;
    private centerY = 0;
    private started = false;
    private destroyed = false;
    private strokeCommitted = false;
    private physicsStepDuration = 1 / 60;
    private draftPoints: readonly Vec2[] = [];
    private draftTail?: Vec2;
    private draftDirty = false;
    private readonly draftSpine = new DrawnSpineCache();
    private planningRevision = 0;
    private readonly pathCache = new WeakMap<Actor, ActorPaths>();
    private readonly polygonBounds = new WeakMap<Vec2[], PathBounds>();
    private drawingGuide?: DrawingGuide;

    constructor(parent: Node, private readonly contentWidth: number, private readonly contentHeight: number,
        private readonly callbacks: CyBlockBeesBoardCallbacks) {
        this.root = this.makeNode('CyBlockBeesBoard', parent);
        this.root.addComponent(UITransform).setContentSize(contentWidth, contentHeight);
        // 与原版主相机一致：水池和场外地形继续存在于物理世界，渲染限于安全玩法窗口。
        this.root.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        this.draft = this.makeNode('draft').addComponent(Graphics);
        this.ropes = this.makeNode('ropes').addComponent(Graphics);
        const system = PhysicsSystem2D.instance;
        this.physicsBefore = { enabled: system.enable, auto: system.autoSimulation, gravity: system.gravity.clone(),
            fixedTimeStep: system.fixedTimeStep, velocityIterations: system.velocityIterations, positionIterations: system.positionIterations };
        this.restoreBroadPhase = configureBox2DBroadPhase(system);
        system.enable = false;
        system.autoSimulation = false;
        system.fixedTimeStep = CYBLOCKBEES_RULES.physicsTimeStep;
        system.velocityIterations = CYBLOCKBEES_RULES.velocityIterations;
        system.positionIterations = CYBLOCKBEES_RULES.positionIterations;
        for (const group of [GROUP.solid, GROUP.bee, GROUP.hive, GROUP.ground, GROUP.line, GROUP.spike, GROUP.mass]) this.originalMatrix.set(group, system.collisionMatrix[group]);
        system.collisionMatrix[GROUP.solid] = ALL_GROUPS & ~GROUP.spike;
        system.collisionMatrix[GROUP.bee] = ALL_GROUPS & ~(GROUP.bee | GROUP.spike);
        system.collisionMatrix[GROUP.hive] = ALL_GROUPS & ~GROUP.spike;
        system.collisionMatrix[GROUP.ground] = ALL_GROUPS & ~GROUP.spike;
        system.collisionMatrix[GROUP.line] = ALL_GROUPS;
        system.collisionMatrix[GROUP.spike] = GROUP.line | GROUP.spike;
        // 仅用于无 collider 的原版绳节质量；不能凭空产生碰撞/触发器接触。
        system.collisionMatrix[GROUP.mass] = 0;
    }
    private makeNode(name: string, parent = this.root): Node {
        const node = new Node(name); node.layer = parent.layer; node.setParent(parent); return node;
    }
    get worldScale(): number { return this.scale; }
    private get metersPerWorld(): number { return this.scale / PTM; }
    get levelElements(): readonly CyBlockBeesElement[] { return this.actors.map(a => a.element!); }
    get aliveDogs(): number { let count = 0; for (const a of this.dogs) if (a.alive) count++; return count; }
    get bonesCollected(): boolean {
        return !this.actors.some(a => a.kind === 'bone') || this.dogs.every(a => a.mode === 1);
    }
    toLocal(x: number, y: number): Vec2 { return new Vec2((x - this.centerX) * this.scale, (y - this.centerY) * this.scale); }
    hivePosition(element: CyBlockBeesElement): Vec2 {
        const actor = this.actors.find(a => a.element === element);
        return actor ? this.position(actor) : this.toLocal(element.x, element.y);
    }
    build(level: CyBlockBeesLevel, spriteOf: (slug: string) => SpriteFrame | undefined): void {
        this.spriteOf = spriteOf; this.fitToLevel(level);
        // PhysicsSystem2D.gravity 的设置器会 /PTM，属性按像素加速度传入。
        PhysicsSystem2D.instance.gravity = new Vec2(0, -9.81 * this.scale);
        for (const element of level.elements) this.actors.push(this.createActor(element));
        // 原版入口场景也有物理，不能只移植 level prefab：侧墙/顶墙限制动态物体，
        // 常驻底部水区处理掉落。独立保存，避免改变 prefab 关节引用的元素下标。
        for (const element of CYBLOCKBEES_ENVIRONMENT) this.environment.push(this.createActor(element));
        this.sceneActors.push(...this.actors, ...this.environment);
        for (const a of this.actors) if (a.kind === 'balloon' || a.kind === 'spider' || a.kind === 'ciqiu' || a.kind === 'ciqiuJoint') this.ropeActors.push(a);
        this.buildBalloonRopes(); this.buildPrefabJoints();
        const ordered = this.actors.concat(this.environment).sort((a, b) => this.renderOrder(a) - this.renderOrder(b));
        ordered.forEach((a, i) => a.node.setSiblingIndex(i));
        // 绳子位于铺底地形上方、前景物体下方，连接点藏在气球结和悬挂物内。
        const foreground = ordered.find(a => this.renderOrder(a) >= -2);
        this.ropes.node.setSiblingIndex(foreground?.node.getSiblingIndex() ?? this.root.children.length - 1);
        this.draft.node.setSiblingIndex(this.root.children.length - 1); this.drawRopes();
        this.buildDrawingGuide(level);
    }
    private buildDrawingGuide(level: CyBlockBeesLevel): void {
        if (level.level !== 1) return;
        const hand = this.actors.find(a => a.kind === 'hand');
        if (!hand?.sprite?.spriteFrame) return;
        // 原 prefab 的手指是静态摆件；用没有刚体的演示层同步绘制笔迹和移动指尖。
        hand.node.active = false;
        const root = this.makeNode('drawing-guide');
        const stroke = this.makeNode('guide-stroke', root).addComponent(Graphics);
        stroke.lineCap = Graphics.LineCap.ROUND; stroke.lineJoin = Graphics.LineJoin.ROUND;
        const finger = this.makeNode('guide-hand', root);
        this.addSprite(finger, 'hand', this.scale, this.scale);
        // 图中的食指尖在画布左上方，节点位置始终与示范线的末端重合。
        finger.getComponent(UITransform)!.setAnchorPoint(.18, .92);
        const points: Vec2[] = [];
        // 同时圈住狗头和左上方圆支点：闭环落下后能挂在支点上，而非一起掉进水中。
        for (let i = 0; i <= 96; i++) {
            const angle = -Math.PI * .75 - Math.PI * 2 * i / 96;
            points.push(this.toLocal(-.6 + 2.4 * Math.cos(angle), .8 + 2.4 * Math.sin(angle)));
        }
        this.drawingGuide = { root, stroke, finger, opacity: root.addComponent(UIOpacity), points, time: 0 };
        this.updateDrawingGuide(0);
    }
    private updateDrawingGuide(dt: number): void {
        const guide = this.drawingGuide;
        if (!guide) return;
        const press = .35, draw = 2.6, hold = .65, fade = .35, rest = .25;
        guide.time = (guide.time + dt) % (press + draw + hold + fade + rest);
        const progress = Math.max(0, Math.min(1, (guide.time - press) / draw));
        const cursor = progress * (guide.points.length - 1), index = Math.floor(cursor);
        const a = guide.points[index], b = guide.points[Math.min(index + 1, guide.points.length - 1)];
        const x = a.x + (b.x - a.x) * (cursor - index), y = a.y + (b.y - a.y) * (cursor - index);
        guide.finger.setPosition(x, y);
        const fingerScale = guide.time < press ? 1 - .08 * Math.sin(guide.time / press * Math.PI) : 1;
        guide.finger.setScale(fingerScale, fingerScale, 1);
        guide.opacity.opacity = Math.round(255 * Math.max(0, 1 - Math.max(0, guide.time - press - draw - hold) / fade));
        const g = guide.stroke; g.clear();
        const trace = (): void => {
            g.moveTo(guide.points[0].x, guide.points[0].y);
            for (let i = 1; i <= index; i++) g.lineTo(guide.points[i].x, guide.points[i].y);
            g.lineTo(x, y); g.stroke();
        };
        g.lineWidth = LINE_WIDTH * this.scale;
        g.strokeColor = new Color(96, 58, 32, 190); trace();
        g.lineWidth = LINE_WIDTH * this.scale * .5;
        g.strokeColor = new Color(255, 230, 146, 240); trace();
    }
    /** 玩家在合法区域落笔时立即移除，演示从不提交墨水或参与物理。 */
    dismissDrawingGuide(): void {
        if (!this.drawingGuide) return;
        this.drawingGuide.root.active = false;
        this.drawingGuide.root.destroy();
        this.drawingGuide = undefined;
    }
    private fitToLevel(level: CyBlockBeesLevel): void {
        // 原版相机 ortho=7.5，机关可把狗推到顶墙附近。适配必须保留整段
        // 运动空间，不能只容纳开局的核心对象，否则矮屏中狗会进入 HUD 后方。
        let minX = -4.21875, maxX = 4.21875, minY = -7.5, maxY = 7.5;
        for (const e of level.elements) {
            // 原作 camera=(0,0), ortho=7.5。铺底水面、延伸地形与树不改变相机构图。
            if (['cloud', 'grass', 'hand', 'support', 'tree', 'drawGround', 'drawRedArea'].indexOf(e.kind) >= 0) continue;
            const c = Math.cos(e.rotation), s = Math.sin(e.rotation);
            const include = (x: number, y: number): void => {
                const px = e.x + c * x * e.scaleX - s * y * e.scaleY;
                const py = e.y + s * x * e.scaleX + c * y * e.scaleY;
                minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            };
            if (e.kind === 'water') {
                const y = e.detail.colliders.reduce((top, f) => Math.max(top,
                    ...this.fixturePaths(f).map(p => Math.max(...p.filter((_v, i) => i % 2 === 1)) * e.scaleY + e.y)), -Infinity);
                if (y > -7.5 && y < 7.5) minY = Math.min(minY, y - .12);
                continue;
            }
            include(0, 0);
            for (const f of e.detail.colliders) {
                if ((e.kind === 'wind' && f.sensor) || (e.kind === 'spider' && f.shape === 'polygon' && f.paths.some(p => Math.max(...p.filter((_v, i) => i % 2 === 1)) > 20))) continue;
                for (const path of this.fixturePaths(f))
                for (let i = 0; i < path.length; i += 2) include(path[i], path[i + 1]);
            }
            for (const v of e.detail.visuals) {
                const m = v.matrix;
                for (const x of [-v.width / 2, v.width / 2]) for (const y of [-v.height / 2, v.height / 2])
                    include(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
            }
            if (e.kind === 'dog') { include(-1.02, -1.045); include(1.02, 1.045); }
        }
        this.scale = Math.min(this.contentWidth / (maxX - minX), this.contentHeight / (maxY - minY + .3));
        // 尽量保持世界原点；仅在核心对象无法完整落入矮屏时平移必要的距离。
        this.centerX = Math.max(maxX - this.contentWidth / this.scale / 2,
            Math.min(0, minX + this.contentWidth / this.scale / 2));
        this.centerY = Math.max(maxY + .15 - this.contentHeight / this.scale / 2,
            Math.min(0, minY - .15 + this.contentHeight / this.scale / 2));
    }
    private renderOrder(a: Actor): number {
        return a.kind === 'water' ? -20 : a.element?.detail.generated.length ? -10 : a.kind === 'hive' ? -2 : a.kind === 'dog' ? 5 : 0;
    }
    private createActor(element: CyBlockBeesElement): Actor {
        const detail = element.detail, node = this.makeNode(element.kind); node.active = false;
        node.addComponent(UITransform).setContentSize(UNIT, UNIT);
        const p = this.toLocal(element.x, element.y); node.setPosition(p.x, p.y);
        const mirrorX = element.scaleX < 0 ? -1 : 1, mirrorY = element.scaleY < 0 ? -1 : 1;
        // Cocos 将负缩放分解到 worldRotation，物理回写后会在 0/180 度之间反馈翻转。
        // 刚体只使用正缩放；镜像烘焙进碰撞轮廓，并由独立显示子节点保留原版造型。
        node.setScale(Math.abs(element.scaleX) * this.scale / UNIT, Math.abs(element.scaleY) * this.scale / UNIT, 1);
        node.angle = element.rotation * DEG;
        const visual = mirrorX < 0 || mirrorY < 0 ? this.makeNode('visual', node) : node;
        if (visual !== node) visual.setScale(mirrorX, mirrorY, 1);
        const body = node.addComponent(RigidBody2D); body.type = ERigidBody2DType.Static;
        body.enabledContactListener = true; body.gravityScale = detail.body?.gravity ?? 1;
        body.linearDamping = detail.body?.drag ?? 0; body.angularDamping = detail.body?.angularDrag ?? .05;
        body.fixedRotation = !!((detail.body?.constraints ?? 0) & 4); body.group = this.groupFor(detail.layer);
        // 配合原包的 100 Hz 固定步保持离散检测。给低速动态对象额外启用 bullet，
        // 会使 Box2D TOI 在复合木块和凹线的多点挤压中产生大幅位置修正。
        body.bullet = false;
        const actor: Actor = { node, element, kind: element.kind, body, colliders: [],
            fixtures: mirrorFixtures(detail.colliders, mirrorX, mirrorY), visualRoot: visual,
            mass: detail.body?.mass ?? 1, alive: true, hurt: 0, grace: 0, age: 0, cooldown: 0, origin: p.clone(), mode: 0, joints: [] };
        this.byNode.set(node, actor); this.addFixtures(actor);
        for (const v of detail.visuals.slice().sort((a, b) => a.order - b.order)) {
            const m = v.matrix, child = this.makeNode(v.slug, visual); child.setPosition(m[4] * UNIT, m[5] * UNIT);
            const sx = Math.hypot(m[0], m[1]); child.setScale(sx, (m[0] * m[3] - m[1] * m[2]) / Math.max(sx, 1e-8), 1);
            child.angle = Math.atan2(m[1], m[0]) * DEG;
            const sprite = this.addSprite(child, v.slug, v.width * UNIT, v.height * UNIT);
            sprite.type = v.mode === 1 ? Sprite.Type.SLICED : v.mode === 2 ? Sprite.Type.TILED : Sprite.Type.SIMPLE;
            sprite.color = new Color(v.color[0], v.color[1], v.color[2], v.color[3]); if (!actor.sprite) actor.sprite = sprite;
        }
        for (const generated of detail.generated) this.renderTerrain(visual, generated);
        if (element.kind === 'dog') {
            // 静态化保留原版状态表情，由独立 SpriteFrame 切换，物理轮廓保持一致。
            actor.sprite = this.addSprite(this.makeNode('dog-head', visual), 'dog-idle', 180, 185);
            this.setDogPose(actor, 'dog-idle');
        } else if (element.kind === 'jelly') {
            // 原版是粉色弹性条的蒙皮网格；用同一物理尺寸的扁平造型，避免误显示成木箱。
            this.renderJelly(actor);
        } else if (!detail.visuals.length && !detail.generated.length) {
            const mapped = CYBLOCKBEES_KIND_SPRITES[element.kind], slug = typeof mapped === 'string' ? mapped : mapped?.[0];
            if (slug && ['support', 'balloonRope'].indexOf(element.kind) < 0) actor.sprite = this.addSprite(this.makeNode(slug, visual), slug, 100, 100);
        }
        if (actor.kind === 'wind') for (const c of actor.colliders) if (c.sensor) c.enabled = false;
        // onEnable 会用已配置好的属性创建 fixture；激活后 apply 会把它们全部销毁重建。
        node.active = true;
        if (actor.kind === 'dog') this.dogs.push(actor);
        if (actor.kind === 'box' || actor.kind === 'drawBox' || actor.kind === 'drawBoxMid' || actor.kind === 'drawBoxLong') this.boxes.push(actor);
        if (actor.kind === 'knife' || actor.kind === 'spider' || actor.kind === 'blackHole' || actor.kind === 'wind' || actor.kind === 'water') this.forceActors.push(actor);
        return actor;
    }
    private addSprite(node: Node, slug: string, width: number, height: number): Sprite {
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform); transform.setContentSize(width, height);
        const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = this.spriteOf(slug) ?? null; return sprite;
    }
    private groupFor(layer: number): number {
        return layer === 12 ? GROUP.bee : layer === 13 ? GROUP.hive : layer === 14 ? GROUP.ground
            : layer === 15 ? GROUP.line : layer === 16 ? GROUP.spike : GROUP.solid;
    }
    private fixturePaths(f: Fixture): readonly (readonly number[])[] {
        if (f.shape === 'polygon') return f.paths;
        if (f.shape === 'box') {
            const x = f.offsetX, y = f.offsetY, a = f.width / 2, b = f.height / 2;
            return [[x - a, y - b, x + a, y - b, x + a, y + b, x - a, y + b]];
        }
        const path: number[] = [];
        for (let i = 0; i < 32; i++) path.push(f.offsetX + Math.cos(i * Math.PI / 16) * f.radius, f.offsetY + Math.sin(i * Math.PI / 16) * f.radius);
        return [path];
    }
    private addFixtures(actor: Actor): void {
        let area = 0;
        for (const f of actor.fixtures) if (f.shape === 'circle') area += Math.PI * f.radius * f.radius;
            else for (const path of this.fixturePaths(f)) area += polygonArea(path);
        const scale = actor.node.scale;
        const density = actor.mass / Math.max(.000001, area * UNIT * UNIT * Math.abs(scale.x * scale.y) / (PTM * PTM));
        for (const f of actor.fixtures) {
            const colliders: Collider2D[] = [];
            if (f.shape === 'circle') {
                const c = actor.node.addComponent(CircleCollider2D); c.radius = f.radius * UNIT;
                c.offset = new Vec2(f.offsetX * UNIT, f.offsetY * UNIT); colliders.push(c);
            } else for (const path of this.fixturePaths(f)) {
                if (path.length < 6 || polygonArea(path) < 1e-8) continue;
                const points = this.physicsPolygon(path, scale);
                if (points.length < 3) continue;
                const c = actor.node.addComponent(PolygonCollider2D); c.points = points; colliders.push(c);
            }
            for (const c of colliders) {
                c.sensor = f.sensor; c.friction = f.friction; c.restitution = f.restitution; c.density = density;
                c.group = this.groupFor(f.layer);
                c.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this); c.on(Contact2DType.PRE_SOLVE, this.onPreSolve, this);
                c.on(Contact2DType.END_CONTACT, this.onEndContact, this);
                this.fixtureByCollider.set(c, f);
                actor.colliders.push(c);
            }
        }
        // 原绳节只有刚体和关节。微小 sensor 提供质量，不产生额外阻挡。
        if (!actor.colliders.length && actor.element?.detail.body) {
            const c = actor.node.addComponent(CircleCollider2D); c.radius = .5; c.sensor = true; c.group = GROUP.mass;
            c.density = actor.mass / Math.max(1e-8, Math.PI * .25 * Math.abs(scale.x * scale.y) / (PTM * PTM)); actor.colliders.push(c);
        }
        actor.physicsScale = actor.node.worldScale.clone();
    }
    private physicsPolygon(path: readonly number[], scale: Vec3): Vec2[] {
        // Creator 3.8.8 Box2D JS 会把距离 < linearSlop/2 (= .004 m) 的顶点焊接。
        // 剩余不足三个点时 Shape.Set 会生成原点处 2×2 m 的默认箱体。
        // 在提交轮廓前执行同样的焊接，低于引擎精度的网格小片没有面积、不能成为碰撞体。
        const points: Vec2[] = [], toleranceSquared = (.004 * PTM) ** 2;
        for (const p of pairs(path, UNIT)) if (!points.some(q =>
            ((p.x - q.x) * scale.x) ** 2 + ((p.y - q.y) * scale.y) ** 2 < toleranceSquared)) points.push(p);
        if (points.length < 3) return [];
        const area = points.reduce((sum, p, i) => {
            const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y;
        }, 0);
        return Math.abs(area) > 1e-8 ? points : [];
    }
    private renderTerrain(parent: Node, data: CyBlockBeesPrefab['generated'][number]): void {
        const g = this.makeNode('terrain', parent).addComponent(Graphics), points = pairs(data.path, UNIT);
        // 「蜂巢贴纸」配色：土色/木色/警示红平涂，深棕描边，草边与精灵的叶绿一致。
        g.fillColor = data.red ? new Color(232, 92, 72) : data.wood ? new Color(233, 168, 92) : new Color(214, 156, 96);
        g.strokeColor = data.red ? new Color(176, 58, 44) : new Color(96, 58, 32); g.lineWidth = 4;
        drawClosedPath(g, points, 0); g.fill(); g.stroke();
        for (const edge of data.edges ?? []) {
            g.fillColor = edge.upper ? new Color(118, 190, 84) : new Color(178, 120, 66);
            // 草边与下边带都是同色网格凸片；只填充，避免把内部拼接边画成格线。
            drawClosedPath(g, pairs(edge.path, UNIT), 0); g.fill();
        }
    }
    private renderJelly(actor: Actor): void {
        const points = actor.fixtures.reduce<Vec2[]>((all, f) => all.concat(this.fixturePaths(f).reduce<Vec2[]>((p, path) => p.concat(pairs(path, UNIT)), [])), []);
        const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
        const height = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
        const node = this.makeNode('jelly-surface', actor.visualRoot ?? actor.node), g = node.addComponent(Graphics);
        g.fillColor = new Color(246, 137, 147); g.strokeColor = new Color(175, 77, 93); g.lineWidth = 4;
        g.roundRect(-width / 2, -height / 2, width, height, height * .25); g.fill(); g.stroke();
        g.strokeColor = new Color(255, 210, 209); g.lineWidth = 5; g.lineCap = Graphics.LineCap.ROUND;
        g.moveTo(-width * .32, height * .25); g.lineTo(width * .19, height * .25); g.stroke();
    }
    private buildPrefabJoints(): void {
        const ropeOwners = new Set(this.actors.filter(a => a.kind === 'balloon' && a.rope?.length)
            .reduce<number[]>((all, a) => all.concat([a.element!.detail.refs.Circle1, a.element!.detail.refs.rfOtherJoint]), []));
        this.actors.forEach((a, i) => {
            if (!ropeOwners.has(i)) for (const data of a.element!.detail.joints)
                this.connectJoint(a, data, data.target >= 0 ? this.actors[data.target] : undefined);
        });
    }
    private connectJoint(actor: Actor, data: JointData, target?: Actor): Joint2D {
        const j = data.type === 'FixedJoint2D' ? actor.node.addComponent(FixedJoint2D)
            : data.type === 'SpringJoint2D' ? actor.node.addComponent(SpringJoint2D)
                : data.type === 'DistanceJoint2D' ? actor.node.addComponent(DistanceJoint2D) : actor.node.addComponent(HingeJoint2D);
        j.connectedBody = target?.body ?? null; j.collideConnected = data.collision;
        // Cocos joint anchor 不再乘节点 scale，需先转换成实际局部像素。
        j.anchor = this.prefabAnchor(actor, data.anchor);
        if (data.autoAnchor) {
            const anchor = actor.body.getWorldPoint(j.anchor, new Vec2());
            j.connectedAnchor = target ? target.body.getLocalPoint(anchor, new Vec2()) : anchor;
        } else if (target) j.connectedAnchor = this.prefabAnchor(target, data.connectedAnchor);
        else {
            const p = this.toLocal(data.connectedAnchor[0], data.connectedAnchor[1]);
            const world = this.root.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(p.x, p.y)); j.connectedAnchor = new Vec2(world.x, world.y);
        }
        if (j instanceof SpringJoint2D) { j.autoCalcDistance = false; j.distance = data.distance * this.scale; j.frequency = data.frequency; j.dampingRatio = data.damping; }
        if (j instanceof DistanceJoint2D) { j.autoCalcDistance = false; j.maxLength = data.distance * this.scale; }
        j.apply(); actor.joints.push(j); return j;
    }
    private prefabAnchor(actor: Actor, point: readonly number[]): Vec2 {
        return new Vec2(point[0] * UNIT * actor.node.scale.x * (actor.element && actor.element.scaleX < 0 ? -1 : 1),
            point[1] * UNIT * actor.node.scale.y * (actor.element && actor.element.scaleY < 0 ? -1 : 1));
    }
    private buildBalloonRopes(): void {
        for (const a of this.actors) {
            if (a.kind !== 'balloon' || a.element!.params.dtIsSingle) continue;
            const refs = a.element!.detail.refs, first = this.actors[refs.Circle1], other = this.actors[refs.rfOtherJoint];
            if (!first || !other) continue;
            const sourceCount = Math.max(5, Math.floor(a.element!.params.dtRopePartCount ?? 15));
            // 绳节没有运行时碰撞轮廓，可合并质量点。保持原始总长和总质量，
            // 用较短的约束链避免 Box2D 十次迭代中的误差累积，并减少物理开销。
            const count = Math.min(sourceCount, MAX_ROPE_PARTICLES), ratio = sourceCount / count;
            const length = Math.max(.02, a.element!.params.dtRopePartLength ?? .06) * this.scale * ratio;
            first.mass = (first.element!.detail.body?.mass ?? first.mass) * ratio;
            a.rope = [first.node]; a.ropeJoints = []; first.ropeParticle = true;
            const anchor = first.element!.detail.joints[0];
            const top = anchor ? this.connectJoint(first, anchor, a) : undefined;
            if (top) a.ropeJoints.push(top);
            const end = other.element!.detail.joints[0];
            const endAnchor = end ? this.prefabAnchor(other, end.anchor) : new Vec2();
            const angle = this.nodeAngle(other.node), c = Math.cos(angle), s = Math.sin(angle);
            const anchorX = c * endAnchor.x - s * endAnchor.y, anchorY = s * endAnchor.x + c * endAnchor.y;
            if (!a.element!.params.dtIsPlatform) other.node.setPosition(first.node.position.x - anchorX,
                first.node.position.y - count * length - anchorY);
            const endX = other.node.position.x + anchorX, endY = other.node.position.y + anchorY;
            let previous = first;
            for (let i = 1; i < count; i++) {
                // prefab 的载荷位置可能比设定绳长远，规划时沿两端均匀放置质量点，
                // 避免把全部初始伸长集中到最后一节，在启用物理时产生单点冲击。
                const node = this.makeNode('rope-link'); node.setPosition(first.node.position.x + (endX - first.node.position.x) * i / count,
                    first.node.position.y + (endY - first.node.position.y) * i / count);
                const body = node.addComponent(RigidBody2D); body.type = ERigidBody2DType.Static; body.gravityScale = 1;
                body.fixedRotation = true;
                const c = node.addComponent(CircleCollider2D); c.radius = .4; c.sensor = true; c.group = GROUP.mass;
                c.density = first.mass / (Math.PI * .16 / (PTM * PTM)); c.apply();
                const link: Actor = { ...first, node, body, visualRoot: node, colliders: [c], fixtures: [], joints: [], element: undefined,
                    origin: new Vec2(node.position.x, node.position.y), physicsScale: node.worldScale.clone() };
                this.byNode.set(node, link);
                // 绳节是质量点，由两点间的固定距离传递拉力。偏心铰链配合微小
                // sensor 的惯量会产生极大的角加速度，使整串约束拉长并抖成锯齿。
                a.ropeJoints.push(this.connectRopeJoint(link, previous, Vec2.ZERO, Vec2.ZERO, length));
                a.rope.push(node); previous = link;
            }
            if (end) {
                a.ropeJoints.push(this.connectRopeJoint(other, previous, endAnchor, Vec2.ZERO, length));
                // 长链的逐节迭代会积累伸长误差；总长约束直接传递端点拉力，
                // 与各节长度之和一致，绳子仍可松弛、弯曲和摆动。
                if (top) a.ropeJoints.push(this.connectRopeJoint(other, a, endAnchor, top.connectedAnchor, count * length, true));
            }
            const rope = this.actors[refs.rfRopeCollider];
            if (rope) { rope.node.setPosition(first.node.position.x, first.node.position.y);
                rope.node.setScale(this.scale / UNIT, count * length / UNIT, 1); rope.colliders.forEach(c => c.apply()); }
        }
    }
    private connectRopeJoint(actor: Actor, target: Actor, anchor: Vec2, connectedAnchor: Vec2, length: number,
        limit = false): SpringJoint2D | DistanceJoint2D {
        // SpringJoint 的 frequency=0 使用 Box2D 的刚性距离约束，不产生弹簧伸缩。
        const joint = limit ? actor.node.addComponent(DistanceJoint2D) : actor.node.addComponent(SpringJoint2D);
        joint.connectedBody = target.body;
        // 跨越整根绳的总长约束不能关闭气球与载荷之间原有的碰撞。
        joint.collideConnected = limit;
        joint.anchor = anchor.clone(); joint.connectedAnchor = connectedAnchor.clone();
        joint.autoCalcDistance = false;
        if (joint instanceof SpringJoint2D) { joint.distance = length; joint.frequency = 0; joint.dampingRatio = 0; }
        else joint.maxLength = length;
        joint.apply(); actor.joints.push(joint); return joint;
    }
    beginSimulation(): void {
        if (this.started || this.destroyed) return; this.started = true;
        this.dismissDrawingGuide();
        for (const a of this.actors) {
            const d = a.element!.detail, kind = a.kind;
            if (kind === 'hand' || kind === 'drawRedArea') { a.node.active = false; continue; }
            if (kind === 'hive' && !d.body) a.colliders.forEach(c => { c.sensor = true; c.apply(); });
            if (kind === 'wind') a.colliders.forEach(c => { if (c.sensor) c.enabled = true; });
            if (kind === 'spider' || kind === 'ciqiu' || kind === 'ciqiuJoint') a.colliders.forEach(c => {
                const role = this.fixtureByCollider.get(c)?.role;
                if (role === 'rfLineCol' || role === 'rfLineRender') c.enabled = false;
            });
            if (kind === 'moveable') a.colliders.forEach(c => { c.enabled = false; });
            const release = ['dog', 'box', 'drawBox', 'drawBoxMid', 'drawBoxLong', 'stone', 'saw', 'knife', 'balloon', 'spider', 'bone', 'ciqiu', 'ciqiuJoint', 'jelly'].indexOf(kind) >= 0;
            if (d.body && (release || d.body.constraints !== 7 || (kind === 'hive' && !d.joints.length))) {
                if (kind !== 'jelly' || a.element!.params.dtCanMove) {
                    a.body.type = ERigidBody2DType.Dynamic;
                    a.body.fixedRotation = ['knife', 'spider'].indexOf(kind) >= 0 || !!(d.body.constraints & 4 && !release);
                    if (kind === 'ciqiu' || kind === 'ciqiuJoint') a.body.fixedRotation = !!d.points?.rfLineRender;
                }
            }
            if (a.rope) {
                a.rope.forEach(n => { this.byNode.get(n)!.body.type = ERigidBody2DType.Dynamic; });
                this.actors[d.refs.rfRopeCollider]?.colliders.forEach(c => { c.enabled = false; });
            }
        }
        for (const a of Array.from(this.byNode.values())) {
            if (a.ropeParticle) a.body.fixedRotation = true;
            this.normalizeMass(a);
        }
        for (const a of this.actors) if (a.kind === 'spider') {
            // Unity FreezePositionX 必须约束求解器；只清零 vx 仍会被风和接触推离竖线。
            const guide = a.node.addComponent(SliderJoint2D);
            guide.autoCalcAngle = false; guide.angle = 90;
            guide.connectedAnchor = a.body.getWorldPoint(Vec2.ZERO, new Vec2());
            guide.apply(); a.joints.push(guide);
        }
    }
    private normalizeMass(a: Actor): void {
        if (a.body.type !== ERigidBody2DType.Dynamic) return;
        const mass = a.body.getMass();
        if (mass <= 1e-8 || Math.abs(mass - a.mass) < 1e-5) return;
        for (const c of a.colliders) if (c.enabled) c.density *= a.mass / mass;
        // Unity 的质量独立于 collider。当前项目固定使用 Box2D JS，直接设置质量和惯量，
        // 避免 Static→Dynamic 后重建 fixture；3.8.8 的 UnBufferMove 只移除一次重复代理。
        const native = a.body.impl!.impl as {
            GetInertia(): number;
            GetLocalCenter(): { x: number; y: number };
            SetMassData(data: { mass: number; I: number; center: { x: number; y: number } }): void;
        };
        native.SetMassData({ mass: a.mass, I: native.GetInertia() * a.mass / mass, center: native.GetLocalCenter() });
    }
    finish(win: boolean): void {
        this.started = false;
        for (const a of this.actors) if (a.kind === 'dog' && a.alive) this.setDogPose(a, win ? 'dog-win' : 'dog-lose');
    }
    updateFrame(dt: number): void {
        if (this.destroyed) return;
        this.flushDraft();
        this.updateDrawingGuide(dt);
        for (const a of this.actors) if (a.alive && a.node.active && a.kind === 'cloud') {
            const x = a.node.position.x + (a.element!.params.moveSpeed ?? .1) * 2 * this.scale * dt;
            a.node.setPosition(x > 10 * this.scale ? -10 * this.scale : x, a.node.position.y);
            if (a.fixtures.length) this.planningRevision++;
        }
        if (!this.started) return;
        // 原 Lua 的蜜蜂追踪、朝向、锯齿旋转和狗头表情均在 Update 中运行。
        // 在物理子步中重复控制速度/转向会覆盖碰撞结果，并反复更新碰撞树。
        for (const a of this.actors) {
            if (!a.alive || !a.node.active) continue;
            if (a.kind === 'jelly') {
                const surface = (a.visualRoot ?? a.node).getChildByName('jelly-surface');
                const pulse = Math.sin((.25 - a.cooldown) / .25 * Math.PI) * .12;
                surface?.setScale(1 + pulse * .4, 1 - pulse, 1);
            }
            if (a.kind === 'saw' && a.sprite) a.sprite.node.angle = this.nodeAngle(a.sprite.node) * DEG - 200 * dt;
            if (a.kind === 'dog' && !a.hurt) {
                let distanceSquared = Infinity;
                const p = a.node.position;
                for (const bee of this.bees) if (bee.alive) {
                    const q = bee.node.position;
                    distanceSquared = Math.min(distanceSquared, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
                }
                if (a.dogPose === 'dog-idle' && distanceSquared < 3 * this.scale * this.scale) this.setDogPose(a, 'dog-scared');
                else if (a.dogPose === 'dog-scared' && distanceSquared >= 6 * this.scale * this.scale) this.setDogPose(a, 'dog-idle');
            }
        }
        this.advanceBees(dt);
    }
    /** 在本帧物理回写后绘制，避免绳端与气球、悬挂物相差一帧。 */
    renderFrame(): void { if (!this.destroyed) this.drawRopes(); }
    beforePhysics(dt: number): void {
        if (!this.started) return;
        this.physicsStepDuration = dt;
        // 一个 Unity collider 在 Cocos 可拆成多片，Enter/PRE_SOLVE/CCD 也会重复通知。
        // 按碰撞对象去重；撞到另一个对象仍应施力，不能用整只蜜蜂共用的冷却吞掉。
        for (const a of this.bees) a.bee!.processed.clear();
        for (const a of this.actors) {
            if (!a.alive || !a.node.active) continue;
            a.age += dt; a.grace = Math.max(0, a.grace - dt); a.cooldown = Math.max(0, a.cooldown - dt);
            if (a.kind === 'moveable') this.movePlatform(a);
            if (a.kind === 'bomb' && a.age >= 5) { a.alive = false; this.deferred.push(() => this.explode(a)); }
        }
    }
    /** 只提交玩法真正改动的变换。物理回写的脏标记不能重新作为输入。
     * Cocos 的标记到渲染帧末才清理；在同帧子步中照单同步，会重复重建长线的
     * 所有 fixture，并对相同刚体反复 SetTransform / FindNewContacts。
     */
    syncSceneToPhysics(): void {
        this.byNode.forEach(a => {
            if (!a.node.activeInHierarchy || !a.body.enabledInHierarchy) return;
            const adapter = a.body.impl as unknown as {
                impl: { GetPosition(): { x: number; y: number }; GetAngle(): number };
                nodeTransformChanged(flags: number): void;
            };
            if (!adapter?.impl) return;
            const scale = a.node.worldScale;
            let flags = 0;
            if (!a.physicsScale || !a.physicsScale.equals(scale)) flags |= Node.TransformBit.SCALE;
            const position = a.node.worldPosition, nativePosition = adapter.impl.GetPosition();
            if (Math.abs(position.x / PTM - nativePosition.x) > 1e-7
                || Math.abs(position.y / PTM - nativePosition.y) > 1e-7) flags |= Node.TransformBit.POSITION;
            const rotation = a.node.worldRotation;
            const angle = Math.atan2(2 * (rotation.w * rotation.z + rotation.x * rotation.y),
                1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z));
            const delta = angle - adapter.impl.GetAngle();
            if (Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) > 1e-7) flags |= Node.TransformBit.ROTATION;
            if (!flags) return;
            adapter.nodeTransformChanged(flags);
            if (flags & Node.TransformBit.SCALE) {
                if (a.physicsScale) a.physicsScale.set(scale); else a.physicsScale = scale.clone();
                this.normalizeMass(a);
            }
        });
    }
    /** 每个游戏帧控制一次蜜蜂，朝向在随后的物理输入同步中提交。 */
    private advanceBees(dt: number): void {
        for (const a of this.bees) {
            const state = a.bee!;
            if (state.phase === 'dead') { state.removeAfter -= dt; continue; }
            if (state.phase === 'fly' || state.phase === 'back') {
                const phase = state.phase; state.time = Math.max(0, state.time - dt);
                if (state.time <= 1e-9) state.phase = 'seek';
                else if (phase === 'fly') a.body.linearVelocity = new Vec2(state.direction * this.metersPerWorld, 0);
                // Lua FlyTo/GoBack 只切换状态；下一次 Update 才执行 FindDog。
                continue;
            }
            let dog: Actor | undefined, distance = Infinity;
            const p = a.node.position;
            for (const candidate of this.dogs) {
                if (!candidate.alive) continue;
                const q = candidate.node.position, squared = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
                if (squared <= distance) { distance = squared; dog = candidate; }
            }
            if (!dog) { a.body.linearVelocity = new Vec2(); continue; }
            const dir = new Vec2(dog.node.position.x - p.x, dog.node.position.y - p.y).normalize();
            const speed = CYBLOCKBEES_RULES.beeSpeed * this.metersPerWorld;
            a.body.linearVelocity = new Vec2(dir.x * speed, dir.y * speed);
            if (a.sprite && a.sprite.node.scale.x < 0) {
                a.sprite.node.setScale(1, 1, 1);
                a.fixtures = mirrorFixtures(a.fixtures, -1, 1);
                const collider = a.colliders[0] as PolygonCollider2D;
                collider.points = pairs(BEE_PATH, UNIT); this.fixtureByCollider.set(collider, a.fixtures[0]); collider.apply();
                this.normalizeMass(a);
            }
            a.node.angle = Math.atan2(-dir.y, -dir.x) * DEG;
        }
    }
    /** 固定物理步运行原 Lua 的力。 */
    applyBeeForces(dt: number): void {
        if (!this.started) return;
        // Enter 使用原包 0.01 秒的单次冲量，Stay 按实际接触时长积分持续力。
        // 渲染帧率和本地固定步长不能放大单次反冲；否则蜜蜂会退得更远、攻击间隔变长。
        if (this.contactForces.length) for (const pending of this.contactForces.splice(0)) if (pending.actor.alive) {
            this.force(pending.actor, pending.force.multiplyScalar(pending.duration / dt));
        }
        for (const a of this.forceActors) {
            if (!a.alive || !a.node.active) continue;
            if (a.kind === 'water') { this.applyBuoyancy(a); continue; }
            const angle = this.nodeAngle(a.node), up = new Vec2(-Math.sin(angle), Math.cos(angle));
            if (a.kind === 'knife') this.force(a, up.clone().multiplyScalar(-5));
            if (a.kind === 'spider') this.updateSpider(a, up);
            if (a.kind === 'blackHole') for (const dog of this.dogs) {
                if (!dog.alive) continue;
                const delta = Vec2.subtract(new Vec2(), this.position(a), this.position(dog)).multiplyScalar(1 / this.scale);
                dog.body.gravityScale = 0; dog.body.linearDamping = 2;
                const length = delta.length();
                this.force(dog, delta.normalize().multiplyScalar(40 * Math.pow(Math.min(length, .5), .33)));
            }
            if (a.kind === 'wind') this.applyWind(a, up);
        }
    }
    afterPhysics(): void {
        if (this.deferred.length) this.deferred.splice(0).forEach(f => f());
        for (let i = this.bees.length - 1; i >= 0; i--) if (this.bees[i].bee!.phase === 'dead' && this.bees[i].bee!.removeAfter <= 0) {
            this.removeActor(this.bees[i]); this.bees.splice(i, 1);
        }
    }
    private position(a: Actor): Vec2 { return new Vec2(a.node.position.x, a.node.position.y); }
    private force(a: Actor, force: Vec2): void {
        // Box2D 在 Step 结束时清空力。碰撞回调的反冲需在下一步积分前施加。
        if ((PhysicsSystem2D.instance as unknown as { _steping: boolean })._steping) {
            this.contactForces.push({ actor: a, force: force.clone(), duration: this.physicsStepDuration });
            return;
        }
        if (a.body.type === ERigidBody2DType.Dynamic) a.body.applyForceToCenter(force.multiplyScalar(this.metersPerWorld), true);
    }
    private contactForce(actor: Actor, force: Vec2, duration: number): void {
        this.contactForces.push({ actor, force, duration });
    }
    private movePlatform(a: Actor): void {
        const e = a.element!, target = this.actors[e.detail.refs.rfTarget]; if (!target) return;
        const width = e.detail.visuals[0]?.width ?? 3, duration = width * 2 / Math.max(.1, e.params.dtSpeed ?? 1);
        const t = (a.age / duration + .25) % 1, offset = ((t < .5 ? t * 2 : 2 - t * 2) * width - width / 2) * e.scaleX * this.scale;
        target.body.type = ERigidBody2DType.Kinematic; target.body.linearVelocity = new Vec2();
        const angle = this.nodeAngle(a.node);
        target.node.setPosition(a.origin.x + Math.cos(angle) * offset, a.origin.y + Math.sin(angle) * offset);
    }
    private updateSpider(a: Actor, up: Vec2): void {
        const delta = (a.node.position.y - a.origin.y) / this.scale;
        if (a.mode === 0) {
            this.force(a, up.clone().multiplyScalar(-20));
            if (a.node.position.y / this.scale + this.centerY < -10) { a.mode = 2; a.body.linearVelocity = new Vec2(); }
        } else if (delta > -1) {
            a.body.linearDamping = 8;
            if (a.mass !== 5) { a.mass = 5; this.normalizeMass(a); }
            this.force(a, up.clone().multiplyScalar(delta < .5 ? -10 : 10));
        } else this.force(a, up.clone().multiplyScalar(a.mode === 2 ? 90 : 25));
    }
    private applyWind(fan: Actor, up: Vec2): void {
        const fanPosition = this.position(fan);
        this.worldPaths(fan);
        const sensors = this.actorPaths(fan).sensorWorld, fanBounds = this.worldBounds(fan);
        if (!sensors.length) return;
        for (const group of [this.actors, this.lines, this.bees]) for (const a of group) {
            if (a === fan || (!a.alive && a.kind !== 'bee') || !a.node.active || a.body.type !== ERigidBody2DType.Dynamic) continue;
            if (!boundsOverlap(fanBounds, this.worldBounds(a))) continue;
            const shapes = this.worldPaths(a);
            if (!this.pathsOverlap(shapes, sensors)) continue;
            const closest = closestPointOnPolygons(fanPosition, shapes);
            const offset = Vec2.subtract(new Vec2(), closest, fanPosition).multiplyScalar(1 / this.scale);
            const far = Vec2.dot(offset, up) > .1 && offset.lengthSqr() > 1;
            const dir = far ? offset.clone().normalize().add(up.clone().multiplyScalar(4)).normalize() : up.clone();
            const force = dir.multiplyScalar(15 * Math.pow(Math.min(offset.length(), .5), .33));
            if (far) {
                const world = this.root.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(closest.x, closest.y));
                a.body.applyForce(force.multiplyScalar(this.metersPerWorld), new Vec2(world.x, world.y), true);
            } else this.force(a, force);
        }
    }
    private applyBuoyancy(water: Actor): void {
        if (!this.boxes.length) return;
        const paths = this.worldPaths(water);
        if (!paths.length) return;
        const waterBounds = this.actorPaths(water).bounds, level = waterBounds.maxY, bottom = waterBounds.minY;
        for (const a of this.boxes) {
            if (a.body.type !== ERigidBody2DType.Dynamic || !boundsOverlap(waterBounds, this.worldBounds(a))) continue;
            const shapes = this.worldPaths(a);
            if (!shapes.length || !this.pathsOverlap(shapes, paths)) continue;
            const bounds = this.actorPaths(a).bounds, width = bounds.maxX - bounds.minX, minY = bounds.minY;
            let total = 0;
            for (let i = 0; i < CYBLOCKBEES_RULES.waterSplits; i++) {
                const y = minY + width / CYBLOCKBEES_RULES.waterSplits * (i + .5);
                if (y < level && y > bottom) total += (level - y) / this.scale * CYBLOCKBEES_RULES.waterBuoyancy * a.mass;
            }
            if (total > 0) this.force(a, new Vec2(0, total));
        }
    }
    spawnBee(position: Vec2, frame?: SpriteFrame, direction = -1, _hive?: CyBlockBeesElement, initial = false): void {
        if (!this.started || this.destroyed) return;
        const node = this.makeNode('bee'); node.active = false; node.setPosition(position.x, position.y);
        node.setScale(.3 * this.scale / UNIT, .3 * this.scale / UNIT, 1);
        const body = node.addComponent(RigidBody2D); body.type = ERigidBody2DType.Dynamic; body.gravityScale = 0; body.fixedRotation = true;
        body.angularDamping = .05;
        body.enabledContactListener = true; body.bullet = false; body.group = GROUP.bee;
        const fixture: Fixture = { shape: 'polygon', paths: [BEE_PATH], sensor: false, layer: 12, friction: .4, restitution: 0 };
        const a: Actor = { node, kind: 'bee', body, colliders: [], fixtures: mirrorFixtures([fixture], direction > 0 ? -1 : 1, 1), mass: 1, alive: true,
            hurt: 0, grace: 0, age: 0, cooldown: 0, origin: position.clone(), mode: 0, joints: [],
            // 原 Lua 初始群不执行 IgnoreCollision；普通出蜂忽略所有有刚体的蜂巢。
            bee: { phase: 'fly', time: .5, direction, removeAfter: Infinity,
                ignoredHives: initial ? [] : this.actors.filter(a => a.kind === 'hive' && a.element!.detail.body).map(a => a.node),
                contacts: new Map(), processed: new Set() } };
        this.byNode.set(node, a); this.addFixtures(a); a.sprite = this.addSprite(this.makeNode('bee-image', node), 'bee', 148, 107);
        a.sprite.node.setScale(direction > 0 ? -1 : 1, 1, 1);
        if (frame) a.sprite.spriteFrame = frame;
        // 属性在激活前配置完毕；onEnable 已创建 fixture，不能再整批重建。
        node.active = true; this.normalizeMass(a);
        body.linearVelocity = new Vec2(direction * this.metersPerWorld, 0); this.bees.push(a);
    }
    private onBeginContact(self: Collider2D, other: Collider2D, contact?: IPhysics2DContact): void {
        if (!this.started) return;
        const a = this.byNode.get(self.node), b = this.byNode.get(other.node); if (!a || !b || !b.alive) return;
        // 原版被刺杀的蜂仍是物理物体，后来落水时由水区调用 OnEnterWater。
        if (a.kind === 'bee' && b.kind === 'water') { this.beeEnterWater(a); return; }
        if (!a.alive) return;
        if (a.kind === 'bee') {
            const contacts = a.bee!.contacts.get(other.node) ?? new Set<IPhysics2DContact>();
            const touching = contacts.size > 0;
            if (contact) { contacts.add(contact); a.bee!.contacts.set(other.node, contacts); }
            this.beeCollision(a, b, other.sensor, touching); return;
        }
        if (a.kind === 'dog') {
            if (['water', 'spike', 'saw', 'ciqiu', 'ciqiuJoint'].indexOf(b.kind) >= 0) this.killDog(a, b.kind);
            if (b.kind === 'bone' && a.mode === 0) { a.mode = 1; b.alive = false; this.deferred.push(() => { b.node.active = false; }); }
        }
        if (a.kind === 'balloon' && ['bee', 'spike', 'saw', 'ciqiu'].indexOf(b.kind) >= 0) this.popBalloon(a);
        if (a.kind === 'ice' && !self.sensor && !other.sensor) this.hitIce(a, b);
        if (a.kind === 'spider' && a.mode === 0 && !self.sensor && !other.sensor) {
            a.mode = b.kind === 'line' ? 2 : 1; a.body.linearVelocity = new Vec2();
            if (b.kind === 'line') this.deferred.push(() => this.connectJoint(a, { type: 'HingeJoint2D', target: -1, anchor: [0, 0],
                connectedAnchor: [0, 0], autoAnchor: true, distance: 0, frequency: 0, damping: 0, collision: false }, b));
        }
        if (a.kind === 'knife' && self.sensor && b.kind === 'line' && a.cooldown <= 0) {
            a.cooldown = .2;
            const p = a.element?.detail.points?.rfBreakPoint ?? [0, -.65];
            const tip = this.nodePoint(a.node, p[0] * UNIT * (a.element && a.element.scaleX < 0 ? -1 : 1),
                p[1] * UNIT * (a.element && a.element.scaleY < 0 ? -1 : 1));
            const closest = this.lineWorldPoints(b).reduce((best, candidate) =>
                Vec2.squaredDistance(candidate, tip) < Vec2.squaredDistance(best, tip) ? candidate : best);
            const angle = this.nodeAngle(a.node), down = new Vec2(Math.sin(angle), -Math.cos(angle));
            if (Vec2.dot(Vec2.subtract(new Vec2(), closest, this.position(a)).normalize(), down) > .25) {
                this.deferred.push(() => {
                    if (!this.cutLine(b, tip)) return;
                    a.body.linearVelocity = new Vec2();
                    a.body.applyLinearImpulseToCenter(down.multiplyScalar(-this.metersPerWorld), true);
                    if (a.element) this.callbacks.onBeeHitObstacle(a.element);
                });
            }
        }
        if (a.kind === 'jelly' && a.cooldown <= 0 && !self.sensor && !other.sensor && b.body.type === ERigidBody2DType.Dynamic && contact) {
            const normal = contact.getWorldManifold().normal.clone();
            if (contact.colliderA !== self) normal.multiplyScalar(-1);
            const angle = this.nodeAngle(a.node), up = new Vec2(-Math.sin(angle), Math.cos(angle));
            const dot = Vec2.dot(normal, up);
            if (dot > .5) {
                a.cooldown = .25;
                const speed = Vec2.subtract(new Vec2(), b.body.linearVelocity, a.body.linearVelocity).length() / this.metersPerWorld;
                b.body.applyLinearImpulseToCenter(normal.multiplyScalar(Math.min(10, Math.max(5, speed * 3)) * dot * b.mass * this.metersPerWorld), true);
            }
        }
    }
    private onPreSolve(self: Collider2D, other: Collider2D, contact?: IPhysics2DContact): void {
        const a = this.byNode.get(self.node), b = this.byNode.get(other.node);
        if (a?.kind === 'bee' && a.bee!.ignoredHives.indexOf(other.node) >= 0) { if (contact) contact.disabled = true; return; }
        if (this.started && a?.kind === 'bee' && b && a.alive && b.alive) this.beeCollision(a, b, other.sensor, true);
        if (this.started && a?.kind === 'ice' && b && a.alive && b.alive) this.hitIce(a, b);
    }
    private onEndContact(self: Collider2D, other: Collider2D, contact?: IPhysics2DContact): void {
        const a = this.byNode.get(self.node);
        if (!a?.bee || !contact) return;
        const contacts = a.bee.contacts.get(other.node);
        contacts?.delete(contact);
        if (!contacts?.size) a.bee.contacts.delete(other.node);
    }
    private hitIce(ice: Actor, other: Actor): void {
        if (ice.cooldown > 0) return;
        const speed = Vec2.subtract(new Vec2(), ice.body.linearVelocity, other.body.linearVelocity).length() / this.metersPerWorld;
        if (speed * speed <= .05) return;
        ice.cooldown = .1; ice.hurt++;
        if (ice.hurt >= 3) { ice.alive = false; this.deferred.push(() => { ice.node.active = false; }); }
        else if (ice.sprite) ice.sprite.spriteFrame = this.spriteOf('ice-' + (ice.hurt + 1)) ?? ice.sprite.spriteFrame;
    }
    private beeCollision(a: Actor, other: Actor, sensor: boolean, stay = false): void {
        if (a.bee!.ignoredHives.indexOf(other.node) >= 0) return;
        if (other.kind === 'water') { if (!stay) this.beeEnterWater(a); return; }
        if (['spike', 'saw', 'ciqiu', 'ciqiuJoint'].indexOf(other.kind) >= 0) {
            this.killBee(a, Infinity, true); if (other.element) this.callbacks.onBeeHitObstacle(other.element); return;
        }
        if (sensor || other.kind === 'bee') return;
        if (a.bee!.processed.has(other.node)) return;
        a.bee!.processed.add(other.node);
        if (other.kind === 'dog' && !stay) {
            other.hurt++;
            if (other.hurt === 1) { other.grace = .5; this.setDogPose(other, 'dog-beaten'); this.callbacks.onDogHurt?.(); }
            else if (other.grace <= 0) this.killDog(other, 'bee');
        }
        // Enter/Stay 都反冲；回退的 .3 秒内不能被寻路速度覆盖。
        const delta = Vec2.subtract(new Vec2(), this.position(other), this.position(a)).multiplyScalar(1 / this.scale);
        const offset = (Math.floor(Math.random() * 2001) - 1000) / 100;
        const recoil = delta.clone().add(new Vec2(offset, offset)).normalize();
        const duration = stay ? this.physicsStepDuration : CYBLOCKBEES_RULES.beeContactTimeStep;
        this.contactForce(a, recoil.multiplyScalar(other.kind === 'dog' || other.kind === 'line' ? -300 : -100), duration);
        if (a.bee!.phase !== 'back') { a.bee!.phase = 'back'; a.bee!.time = .3; }
        if (other.kind === 'line') { this.contactForce(other, delta.normalize().multiplyScalar(80), duration); if (!stay) this.callbacks.onBeeHitLine(); }
        else if (other.kind === 'dog') this.contactForce(other, delta.normalize(), duration);
    }
    private setDogPose(a: Actor, slug: DogPose): void {
        if (!a.sprite) return;
        const frame = this.spriteOf(slug) ?? this.spriteOf('dog-idle');
        if (a.dogPose === slug && a.sprite.spriteFrame === frame) return;
        a.dogPose = slug;
        if (frame) a.sprite.spriteFrame = frame;
        a.sprite.color = Color.WHITE;
    }
    private killDog(a: Actor, cause: string): void {
        if (!a.alive || !a.element) return; a.alive = false; this.setDogPose(a, 'dog-lose'); this.callbacks.onDogStung(a.element, cause);
    }
    private killBee(a: Actor, delay: number, fall: boolean): void {
        // OnEnterDici 只关闭 AI、改变质量和重力，没有定时删除尸体。
        // 尸体随后仍能落水或被炸掉；正在消失的蜂不能重复安排移除。
        if (!a.alive && (fall || a.bee!.removeAfter !== Infinity)) return;
        a.alive = false; a.bee!.phase = 'dead'; a.bee!.removeAfter = fall ? Infinity : delay;
        if (fall) {
            if (a.sprite) a.sprite.spriteFrame = this.spriteOf('bee-die') ?? a.sprite.spriteFrame;
            a.body.gravityScale = 1.5; a.body.fixedRotation = false; a.mass = .07;
            this.deferred.push(() => this.normalizeMass(a));
        }
    }
    private beeEnterWater(a: Actor): void {
        if (!a.alive && a.bee!.removeAfter !== Infinity) return;
        this.killBee(a, (7 + Math.floor(Math.random() * 7)) * .01, false);
        this.callbacks.onBeeEnterWater();
    }
    private popBalloon(a: Actor): void {
        a.alive = false; this.deferred.push(() => {
            a.node.active = false;
            for (const node of a.rope ?? []) {
                this.byNode.get(node)?.joints.forEach(j => { j.enabled = false; }); node.active = false;
            }
            // 同一悬挂物可能连着多个气球，只拆掉当前气球拥有的关节。
            a.ropeJoints?.forEach(j => { j.enabled = false; }); a.ropeJoints = undefined; a.rope = undefined;
        });
    }
    private explode(bomb: Actor): void {
        bomb.node.active = false; this.callbacks.onExplosion?.(); const origin = this.position(bomb);
        for (const a of [...this.actors, ...this.lines, ...this.bees]) {
            if (a === bomb || (!a.alive && a.kind !== 'bee') || !a.node.active || a.body.type !== ERigidBody2DType.Dynamic) continue;
            const delta = Vec2.subtract(new Vec2(), this.position(a), origin).multiplyScalar(1 / this.scale), distance = delta.length();
            const paths = this.worldPaths(a); if (!paths.length) continue;
            const closest = closestPointOnPolygons(origin, paths);
            if (Vec2.distance(closest, origin) > 6 * this.scale) continue;
            const circle = bomb.fixtures.find(f => f.shape === 'circle');
            const radius = circle?.shape === 'circle' ? circle.radius : .4;
            const outside = origin.clone().add(delta.clone().normalize().multiplyScalar(radius * this.scale));
            const shields = [...this.actors, ...this.lines].filter(o => o !== a && o !== bomb && o.alive && o.node.activeInHierarchy
                && o.fixtures.some(f => !f.sensor && (f.layer === 14 || f.layer === 15)));
            // 原版两次 Linecast 都命中才算遮挡；判断碰撞层，不能拿有没有地形渲染数据代替。
            const blocked = shields.some(o => this.intersects(o, origin, this.position(a), 0))
                && shields.some(o => this.intersects(o, outside, this.position(a), 0));
            if (!blocked && a.kind === 'dog') this.killDog(a, 'bomb');
            if (!blocked && a.kind === 'bee') this.killBee(a, (5 + Math.floor(Math.random() * 12)) * .01, false);
            const force = 35 * Math.pow(Math.min(distance, .5), .33) / Math.max(.001, a.mass) * (blocked ? .75 : 1);
            const world = this.root.getComponent(UITransform)!.convertToWorldSpaceAR(new Vec3(origin.x, origin.y));
            a.body.applyLinearImpulse(delta.normalize().multiplyScalar(force * this.metersPerWorld), new Vec2(world.x, world.y), true);
        }
    }
    setDraft(points: readonly Vec2[], illegalTail?: Vec2 | boolean): void {
        // 一帧内可能收到多次 TOUCH_MOVE。只保存最新输入，渲染帧统一生成一次网格。
        this.draftPoints = points; this.draftTail = illegalTail instanceof Vec2 ? illegalTail : undefined;
        this.draftDirty = true;
        if (!points.length) { this.draft.clear(); this.draftDirty = false; this.draftSpine.clear(); }
    }
    private flushDraft(): void {
        if (!this.draftDirty) return;
        this.draftDirty = false; this.draft.clear();
        // 线性补点不改变轮廓，Graphics 不需要用于切线的密集采样。
        const spine = this.draftSpine.update(this.draftPoints, this.scale, (to, from) => !this.isBlocked(
            new Vec2(to.x * this.scale, to.y * this.scale), new Vec2(from.x * this.scale, from.y * this.scale)), this.planningRevision);
        this.drawStroke(this.draft, spine, INK, LINE_WIDTH * this.scale);
        if (this.draftTail && this.draftPoints.length) this.drawStroke(this.draft,
            [this.draftPoints[this.draftPoints.length - 1], this.draftTail], new Color(216, 52, 51), LINE_WIDTH * this.scale);
    }
    private smooth(points: readonly Vec2[], interpolate = true): Vec2[] {
        // Lua 的 .1 插值阈值是世界单位，不是 .1 UI 像素。
        const world = points.map(p => p.clone().multiplyScalar(1 / this.scale));
        const legal = (to: Vec2, from: Vec2): boolean => !this.isBlocked(
            new Vec2(to.x * this.scale, to.y * this.scale), new Vec2(from.x * this.scale, from.y * this.scale));
        // 平滑序列可能重复引用同一个端点；转换必须创建新向量，不能反复乘同一对象。
        return (interpolate ? buildDrawnLine(world, legal) : buildDrawnSpine(world, legal))
            .map(p => new Vec2(p.x * this.scale, p.y * this.scale));
    }
    private drawStroke(g: Graphics, points: readonly Vec2[], color: Color, width: number): void {
        if (!points.length) return; g.strokeColor = color; g.fillColor = color; g.lineWidth = width;
        g.lineCap = Graphics.LineCap.ROUND; g.lineJoin = Graphics.LineJoin.ROUND; g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
        if (points.length > 1) g.stroke(); else { g.circle(points[0].x, points[0].y, width / 2); g.fill(); }
    }
    commitLine(points: readonly Vec2[]): boolean {
        if (this.strokeCommitted || points.length < 2 || this.destroyed
            || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
        this.strokeCommitted = true; this.setDraft([]); this.createLine(this.smooth(points)); return true;
    }
    private createLine(points: readonly Vec2[], velocity = new Vec2(), angularVelocity = 0, mass = 1,
        origin = this.toLocal(0, 0)): Actor {
        // 原作线对象初始位于世界原点。不能改成点集均值，蜜蜂推线和切线克隆会使用这个原点。
        const node = this.makeNode('CyBlockBeesLine'); node.active = false; node.setPosition(origin.x, origin.y);
        const local = points.map(p => Vec2.subtract(new Vec2(), p, origin)), fixtures: Fixture[] = [], half = LINE_WIDTH * this.scale / 2;
        // 插值产生的重复点、同一直线补点不增加几何；合并后仍保留完整采样点供切线使用。
        const geometry = removeCollinear(local);
        for (let i = 1; i < geometry.length; i++) {
            const a = geometry[i - 1], b = geometry[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy); if (length < .1) continue;
            const nx = -dy / length * half, ny = dx / length * half;
            const path = [a.x + nx, a.y + ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny, a.x - nx, a.y - ny].map(v => v / UNIT);
            fixtures.push({ shape: 'polygon', paths: [path], sensor: false, layer: 15, friction: .4, restitution: 0 });
        }
        for (const p of geometry) fixtures.push({ shape: 'circle', radius: half / UNIT, offsetX: p.x / UNIT,
            offsetY: p.y / UNIT, sensor: false, layer: 15, friction: .4, restitution: 0 });
        const body = node.addComponent(RigidBody2D); body.type = ERigidBody2DType.Dynamic; body.gravityScale = 1;
        body.angularDamping = .05; body.enabledContactListener = true; body.bullet = false; body.group = GROUP.line;
        const a: Actor = { node, kind: 'line', body, fixtures: distinctLineFixtures(fixtures), colliders: [], mass, alive: true, hurt: 0,
            grace: 0, age: 0, cooldown: 0, origin, mode: 0, joints: [], line: local };
        this.byNode.set(node, a);
        if (geometry.some((p, i) => i > 0 && Vec2.distance(p, geometry[i - 1]) >= .1)) {
            const collider = node.addComponent(CyBlockBeesStrokeCollider2D); collider.points = geometry; collider.radius = half;
            const area = a.fixtures.reduce((sum, f) => sum + (f.shape === 'circle' ? Math.PI * f.radius * f.radius
                : this.fixturePaths(f).reduce((total, path) => total + polygonArea(path), 0)), 0);
            collider.density = mass / Math.max(.000001, area * UNIT * UNIT / (PTM * PTM));
            collider.friction = .4; collider.group = GROUP.line;
            collider.on(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this);
            collider.on(Contact2DType.PRE_SOLVE, this.onPreSolve, this);
            collider.on(Contact2DType.END_CONTACT, this.onEndContact, this);
            a.colliders.push(collider); a.physicsScale = node.worldScale.clone();
            this.fixtureByCollider.set(collider, a.fixtures[0]);
        } else {
            // 零长度切线碎片是圆点，不能提交零长度边给 chain contact。
            this.addFixtures(a);
        }
        this.drawStroke(node.addComponent(Graphics), local, INK, half * 2);
        // 单个连续碰撞体只创建一次，质量积分仍包含相同线段和圆头。
        node.active = true; this.normalizeMass(a);
        body.linearVelocity = velocity; body.angularVelocity = angularVelocity;
        this.lines.push(a); return a;
    }
    private lineWorldPoints(a: Actor): Vec2[] { return (a.line ?? []).map(p => this.nodePoint(a.node, p.x, p.y)); }
    private cutLine(line: Actor, point: Vec2): boolean {
        if (!line.alive || !line.line || line.line.length < 6) return false;
        const points = this.lineWorldPoints(line); let closest = 0, distance = Infinity;
        points.forEach((p, i) => { const d = Vec2.squaredDistance(p, point); if (d < distance) { closest = i; distance = d; } });
        if (closest < 3 || closest > points.length - 3) return false;
        const velocity = line.body.linearVelocity.clone(), angular = line.body.angularVelocity;
        const parts = [this.createLine(points.slice(0, closest - 1), velocity, angular, 1, this.position(line)),
            this.createLine(points.slice(closest + 2), velocity, angular, 1, this.position(line))];
        for (const spider of this.actors.filter(a => a.kind === 'spider')) for (const joint of spider.joints) {
            if (joint.connectedBody !== line.body) continue;
            const jointWorld = spider.body.getWorldPoint(joint.anchor, new Vec2());
            const local = this.root.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(jointWorld.x, jointWorld.y));
            const p = new Vec2(local.x, local.y);
            const nearest = (part: Actor): number => Math.min(...this.lineWorldPoints(part).map(q => Vec2.squaredDistance(q, p)));
            const target = nearest(parts[0]) <= nearest(parts[1]) ? parts[0] : parts[1];
            joint.connectedBody = target.body;
            joint.connectedAnchor = target.body.getLocalPoint(jointWorld, new Vec2()); joint.apply();
        }
        this.removeActor(line); this.lines.splice(this.lines.indexOf(line), 1);
        return true;
    }
    clearLine(): void { this.lines.forEach(a => this.removeActor(a)); this.lines.length = 0; this.setDraft([]); this.strokeCommitted = false; }
    /** 原版用终点圆探针和中心线 Linecast；不能把探针扩成整段的额外禁画边带。 */
    isBlocked(point: Vec2, from?: Vec2): boolean {
        const radius = CYBLOCKBEES_RULES.illegalProbeRadius * this.scale;
        if (Math.abs(point.x) > this.contentWidth / 2 - radius || Math.abs(point.y) > this.contentHeight / 2 - radius) return true;
        return this.sceneActors.some(a => a.alive && a.node.active && a.fixtures.length
            && (this.intersects(a, point, point, radius, true) || !!from && this.intersects(a, from, point, 0, true)));
    }
    private intersects(a: Actor, from: Vec2, to: Vec2, radius: number, planning = false): boolean {
        const minX = Math.min(from.x, to.x) - radius, minY = Math.min(from.y, to.y) - radius;
        const maxX = Math.max(from.x, to.x) + radius, maxY = Math.max(from.y, to.y) + radius;
        const coarse = this.worldBounds(a);
        if (maxX < coarse.minX || minX > coarse.maxX || maxY < coarse.minY || minY > coarse.maxY) return false;
        for (const polygon of this.worldPaths(a, planning)) {
            const bounds = this.polygonBounds.get(polygon)!;
            if (maxX < bounds.minX || minX > bounds.maxX || maxY < bounds.minY || minY > bounds.maxY) continue;
            if (pointInside(from, polygon) || pointInside(to, polygon)) return true;
            for (let i = 0; i < polygon.length; i++) {
                const p = polygon[i], q = polygon[(i + 1) % polygon.length];
                if (segmentsCross(from, to, p, q) || segmentDistance(from, to, p, q) <= radius) return true;
            }
        }
        return false;
    }
    private nodeAngle(node: Node): number {
        // Node.angle 通过 YZX 欧拉角分解，物理回写后会把 >90° 的 Z 旋转折回 [-90,90]。
        // 从四元数读取完整平面朝向，碰撞轮廓、切线点和机关方向才能与真实旋转一致。
        const q = node.rotation;
        return Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
    }
    private nodePoint(node: Node, x: number, y: number): Vec2 {
        const angle = this.nodeAngle(node), c = Math.cos(angle), s = Math.sin(angle);
        return new Vec2(node.position.x + c * x * node.scale.x - s * y * node.scale.y, node.position.y + s * x * node.scale.x + c * y * node.scale.y);
    }
    private actorPaths(a: Actor): ActorPaths {
        let cache = this.pathCache.get(a);
        if (!cache || cache.fixtures !== a.fixtures) {
            const local: Vec2[][] = [], world: Vec2[][] = [], planningWorld: Vec2[][] = [], sensorWorld: Vec2[][] = [];
            const localBounds = emptyBounds();
            for (const f of a.fixtures) for (const path of this.fixturePaths(f)) {
                const points = pairs(path, UNIT), transformed = points.map(() => new Vec2());
                local.push(points); world.push(transformed);
                for (const p of points) includePoint(localBounds, p.x, p.y);
                this.polygonBounds.set(transformed, emptyBounds());
                if (!(a.kind === 'wind' && f.sensor)) planningWorld.push(transformed);
                if (f.sensor) sensorWorld.push(transformed);
            }
            cache = { fixtures: a.fixtures, local, localBounds, world, planningWorld, sensorWorld,
                bounds: emptyBounds(), coarseBounds: emptyBounds(), x: NaN, y: NaN, sx: NaN, sy: NaN, angle: NaN };
            this.pathCache.set(a, cache);
        }
        return cache;
    }
    /** 先变换局部包围盒的中心和半径；远离水区/风区的长线不必逐点变换。
     * 旋转后的盒子是保守范围，精确重叠仍由完整多边形判断。
     */
    private worldBounds(a: Actor): PathBounds {
        const cache = this.actorPaths(a), local = cache.localBounds, bounds = cache.coarseBounds;
        if (local.minX === Infinity) return bounds;
        const p = a.node.position, scale = a.node.scale, angle = this.nodeAngle(a.node), c = Math.cos(angle), s = Math.sin(angle);
        const cx = (local.minX + local.maxX) * .5 * scale.x, cy = (local.minY + local.maxY) * .5 * scale.y;
        const hx = (local.maxX - local.minX) * .5 * Math.abs(scale.x), hy = (local.maxY - local.minY) * .5 * Math.abs(scale.y);
        const x = p.x + c * cx - s * cy, y = p.y + s * cx + c * cy;
        const rx = Math.abs(c) * hx + Math.abs(s) * hy + 1e-7, ry = Math.abs(s) * hx + Math.abs(c) * hy + 1e-7;
        bounds.minX = x - rx; bounds.maxX = x + rx; bounds.minY = y - ry; bounds.maxY = y + ry;
        return bounds;
    }
    private worldPaths(a: Actor, planning = false): Vec2[][] {
        const cache = this.actorPaths(a);
        const p = a.node.position, scale = a.node.scale, angle = this.nodeAngle(a.node);
        if (cache.x !== p.x || cache.y !== p.y || cache.sx !== scale.x || cache.sy !== scale.y || cache.angle !== angle) {
            const c = Math.cos(angle), s = Math.sin(angle);
            resetBounds(cache.bounds);
            // 点数组与包围盒一起原地更新，避免每个 100 Hz 物理步重新分配整条线的几何。
            for (let i = 0; i < cache.local.length; i++) {
                const path = cache.local[i], world = cache.world[i], bounds = this.polygonBounds.get(world)!;
                resetBounds(bounds);
                for (let j = 0; j < path.length; j++) {
                    const point = path[j], x = p.x + c * point.x * scale.x - s * point.y * scale.y;
                    const y = p.y + s * point.x * scale.x + c * point.y * scale.y;
                    world[j].set(x, y); includePoint(bounds, x, y); includePoint(cache.bounds, x, y);
                }
            }
            cache.x = p.x; cache.y = p.y; cache.sx = scale.x; cache.sy = scale.y; cache.angle = angle;
        }
        return planning ? cache.planningWorld : cache.world;
    }
    private pathsOverlap(first: Vec2[][], second: Vec2[][]): boolean {
        for (const a of first) for (const b of second)
            if (boundsOverlap(this.polygonBounds.get(a)!, this.polygonBounds.get(b)!) && polygonsOverlap(a, b)) return true;
        return false;
    }
    private drawRopes(): void {
        if (!this.ropeActors.length) return;
        this.ropes.clear(); this.ropes.strokeColor = ROPE_COLOR; this.ropes.lineWidth = .035 * this.scale;
        for (const a of this.ropeActors) {
            if (a.alive && a.rope?.length) {
                const first = a.rope[0]; this.ropes.moveTo(first.position.x, first.position.y);
                for (let i = 1; i < a.rope.length; i++) {
                    const p = a.rope[i].position; this.ropes.lineTo(p.x, p.y);
                }
                const end = this.actors[a.element!.detail.refs.rfOtherJoint];
                if (end) {
                    const joint = a.ropeJoints?.find(j => j.node === end.node), anchor = joint?.anchor ?? Vec2.ZERO;
                    const angle = this.nodeAngle(end.node), c = Math.cos(angle), s = Math.sin(angle);
                    this.ropes.lineTo(end.node.position.x + c * anchor.x - s * anchor.y,
                        end.node.position.y + s * anchor.x + c * anchor.y);
                }
                this.ropes.stroke();
            }
            if (a.kind === 'spider' && a.alive) {
                this.ropes.moveTo(a.origin.x, this.contentHeight / 2); this.ropes.lineTo(a.node.position.x, a.node.position.y); this.ropes.stroke();
            }
            if (['ciqiu', 'ciqiuJoint'].indexOf(a.kind) >= 0) for (const j of a.joints) if (j.connectedBody) {
                this.ropes.moveTo(a.node.position.x, a.node.position.y); this.ropes.lineTo(j.connectedBody.node.position.x, j.connectedBody.node.position.y); this.ropes.stroke();
            }
        }
    }
    private removeActor(a: Actor): void {
        a.alive = false;
        a.joints.forEach(j => { j.enabled = false; });
        a.colliders.forEach(c => { c.off(Contact2DType.BEGIN_CONTACT, this.onBeginContact, this); c.off(Contact2DType.PRE_SOLVE, this.onPreSolve, this);
            c.off(Contact2DType.END_CONTACT, this.onEndContact, this); });
        a.bee?.contacts.clear(); a.bee?.processed.clear();
        a.colliders.forEach(c => this.fixtureByCollider.delete(c));
        this.byNode.delete(a.node);
        this.pathCache.delete(a);
        if (a.node.isValid) { a.node.active = false; a.node.destroy(); }
    }
    destroy(): void {
        if (this.destroyed) return; this.destroyed = true; this.started = false; this.deferred.length = 0; this.contactForces.length = 0;
        this.dismissDrawingGuide();
        for (const a of Array.from(this.byNode.values())) this.removeActor(a);
        this.actors.length = 0; this.environment.length = 0; this.lines.length = 0; this.bees.length = 0; this.byNode.clear(); this.fixtureByCollider.clear(); this.spriteOf = () => undefined;
        this.sceneActors.length = 0; this.dogs.length = 0; this.boxes.length = 0; this.forceActors.length = 0; this.ropeActors.length = 0;
        this.draftPoints = []; this.draftTail = undefined; this.draftDirty = false;
        this.draftSpine.clear();
        this.root.destroy();
        this.restoreBroadPhase();
        const system = PhysicsSystem2D.instance;
        this.originalMatrix.forEach((mask, group) => { system.collisionMatrix[group] = mask; }); this.originalMatrix.clear();
        system.gravity = this.physicsBefore.gravity; system.autoSimulation = this.physicsBefore.auto; system.enable = this.physicsBefore.enabled; physicsAccumulator = 0;
        system.fixedTimeStep = this.physicsBefore.fixedTimeStep;
        system.velocityIterations = this.physicsBefore.velocityIterations; system.positionIterations = this.physicsBefore.positionIterations;
    }
}
function emptyBounds(): PathBounds { return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; }
function resetBounds(bounds: PathBounds): void { bounds.minX = bounds.minY = Infinity; bounds.maxX = bounds.maxY = -Infinity; }
function includePoint(bounds: PathBounds, x: number, y: number): void {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
}
function boundsOverlap(a: PathBounds, b: PathBounds): boolean {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
/**
 * 3.8.8 的 Box2D JS 可重复 BufferMove 同一代理，但 UnBufferMove 只清除 indexOf 的
 * 第一次匹配。连续切关、复合刚体更新或关节断开会留下已释放的树节点。这里恢复 Box2D
 * 正确的队列删除算法：清除有效队列中的所有匹配。
 * 原生宽相位还会先收集、排序同一刚体的全部重叠 fixture 对，再由 AddPair 丢弃。
 * 密集笔迹包含数百个相互重叠的线段，这些无效对产生平方级排序和分配开销。
 * 将 Box2D 已有的同刚体排除提前到候选收集阶段；有效对仍按原代理顺序去重提交。
 * 本后端 AABB.Contains 的比较方向反了，使正常运动反复重插代理，大幅运动又可能
 * 漏掉边界更新。MoveProxy 使用正确的包含关系，保留原来的 .1 m 余量和两倍位移预测。
 * 这些适配仅在本游戏的 Session 内生效，退出关卡后恢复原实现。
 */
function configureBox2DBroadPhase(system: PhysicsSystem2D): () => void {
    interface NativeFixture { GetBody(): object; GetType(): number; m_proxies: { treeNode: Proxy | null }[]; }
    interface ProxyData { fixture: NativeFixture; childIndex: number; }
    interface Bounds {
        lowerBound: { x: number; y: number }; upperBound: { x: number; y: number };
        TestOverlap(other: Bounds): boolean;
    }
    interface Proxy { m_id: number; aabb: Bounds; userData: ProxyData; child1: Proxy | null; child2: Proxy | null; }
    interface Pair { proxyA: Proxy; proxyB: Proxy; }
    interface BroadPhase {
        m_moveCount: number;
        m_moveBuffer: (Proxy | null)[];
        m_pairCount: number;
        m_proxyCount: number;
        m_pairBuffer: Pair[];
        m_tree: { m_root: Proxy | null; m_insertionCount: number;
            MoveProxy(proxy: Proxy, bounds: Bounds, displacement: { x: number; y: number }): boolean;
            RemoveLeaf(proxy: Proxy): void; InsertLeaf(proxy: Proxy): void };
        UnBufferMove(proxy: Proxy): void;
        UpdatePairs(callback: (a: ProxyData, b: ProxyData) => void): void;
    }
    interface NativeContact {
        m_fixtureA: NativeFixture; m_fixtureB: NativeFixture; m_indexA: number; m_indexB: number; m_next: NativeContact | null;
    }
    type World = { m_contactManager: { m_broadPhase: BroadPhase; m_contactList: NativeContact | null;
        FindNewContacts(): void; AddPair(a: ProxyData, b: ProxyData): void;
        Destroy(contact: NativeContact): void;
        m_contactFactory: { m_registers: { createFcn: (() => unknown) | null }[][] };
        m_contactFilter: { ShouldCollide(a: NativeFixture, b: NativeFixture): boolean } } };
    const world = system.physicsWorld as unknown as { impl?: World; _world?: World };
    const manager = (world.impl ?? world._world)!.m_contactManager, broad = manager.m_broadPhase;
    const contactTypes = manager.m_contactFactory.m_registers;
    const compatibleTypes = contactTypes.map(row => row.reduce((mask, entry, type) => entry.createFcn ? mask | (1 << type) : mask, 0));
    const tree = broad.m_tree, originalMovement = tree.MoveProxy;
    const originalRemoval = broad.UnBufferMove, originalPairs = broad.UpdatePairs;
    const originalFind = manager.FindNewContacts, originalAdd = manager.AddPair;
    const originalDestroy = manager.Destroy;
    tree.MoveProxy = function (proxy: Proxy, bounds: Bounds, displacement: { x: number; y: number }): boolean {
        const fat = proxy.aabb;
        if (fat.lowerBound.x <= bounds.lowerBound.x && fat.lowerBound.y <= bounds.lowerBound.y
            && fat.upperBound.x >= bounds.upperBound.x && fat.upperBound.y >= bounds.upperBound.y) return false;
        this.RemoveLeaf(proxy);
        fat.lowerBound.x = bounds.lowerBound.x - .1; fat.lowerBound.y = bounds.lowerBound.y - .1;
        fat.upperBound.x = bounds.upperBound.x + .1; fat.upperBound.y = bounds.upperBound.y + .1;
        const dx = 2 * displacement.x, dy = 2 * displacement.y;
        if (dx < 0) fat.lowerBound.x += dx; else fat.upperBound.x += dx;
        if (dy < 0) fat.lowerBound.y += dy; else fat.upperBound.y += dy;
        this.InsertLeaf(proxy); return true;
    };
    let contacts = new WeakMap<NativeFixture, Map<NativeFixture, Map<number, Set<number>>>>();
    const record = (a: NativeFixture, ai: number, b: NativeFixture, bi: number): void => {
        let fixtures = contacts.get(a); if (!fixtures) { fixtures = new Map(); contacts.set(a, fixtures); }
        let children = fixtures.get(b); if (!children) { children = new Map(); fixtures.set(b, children); }
        let indices = children.get(ai); if (!indices) { indices = new Set(); children.set(ai, indices); }
        indices.add(bi);
    };
    const forget = (a: NativeFixture, ai: number, b: NativeFixture, bi: number): void => {
        const fixtures = contacts.get(a), children = fixtures?.get(b), indices = children?.get(ai);
        if (!indices) return;
        indices.delete(bi);
        if (!indices.size) children!.delete(ai);
        if (!children!.size) fixtures!.delete(b);
        if (!fixtures!.size) contacts.delete(a);
    };
    // fixture + childIndex 才是接触的身份，不能用可复用的树节点身份长期索引。
    // 按接触的创建/销毁维护索引，避免每次 FindNewContacts 都遍历并分配整个接触表。
    const remember = (c: NativeContact): void => {
        record(c.m_fixtureA, c.m_indexA, c.m_fixtureB, c.m_indexB);
        record(c.m_fixtureB, c.m_indexB, c.m_fixtureA, c.m_indexA);
    };
    for (let c = manager.m_contactList; c; c = c.m_next) remember(c);
    manager.AddPair = function (a: ProxyData, b: ProxyData): void {
        if (contacts.get(a.fixture)?.get(b.fixture)?.get(a.childIndex)?.has(b.childIndex)) return;
        const previous = this.m_contactList;
        originalAdd.call(this, a, b);
        if (this.m_contactList && this.m_contactList !== previous) remember(this.m_contactList);
    };
    manager.Destroy = function (c: NativeContact): void {
        forget(c.m_fixtureA, c.m_indexA, c.m_fixtureB, c.m_indexB);
        forget(c.m_fixtureB, c.m_indexB, c.m_fixtureA, c.m_indexA);
        originalDestroy.call(this, c);
    };
    broad.UnBufferMove = function (proxy: Proxy): void {
        for (let i = 0; i < this.m_moveCount; i++) if (this.m_moveBuffer[i] === proxy) this.m_moveBuffer[i] = null;
    };
    let owners = new WeakMap<Proxy, object | null>(), shapeTypes = new WeakMap<Proxy, number>(), insertionCount = -1, proxyCount = -1;
    interface BodyQueries { proxies: Proxy[]; compatibleTypes: number; lowerX: number; lowerY: number; upperX: number; upperY: number; }
    const stack: Proxy[] = [], matching: Proxy[] = [], queries = new Set<Proxy>(), groups = new Map<object, BodyQueries>();
    const summarize = (node: Proxy): object | null => {
        let body: object | null;
        if (!node.child1) { body = node.userData.fixture.GetBody(); shapeTypes.set(node, 1 << node.userData.fixture.GetType()); }
        else {
            const first = summarize(node.child1), second = summarize(node.child2!);
            body = first === second ? first : null;
            shapeTypes.set(node, shapeTypes.get(node.child1)! | shapeTypes.get(node.child2!)!);
        }
        owners.set(node, body); return body;
    };
    broad.UpdatePairs = function (callback: (a: ProxyData, b: ProxyData) => void): void {
        const pairs = this.m_pairBuffer; let count = 0;
        const root = this.m_tree.m_root;
        // 插入/移动会增加 insertionCount，移除会改变 proxyCount；按树结构变化重新汇总。
        // 同一刚体的整棵子树可直接跳过，避免密集自重叠笔迹的平方级叶子遍历。
        if (root && this.m_moveCount && (insertionCount !== this.m_tree.m_insertionCount || proxyCount !== this.m_proxyCount)) {
            owners = new WeakMap(); shapeTypes = new WeakMap(); summarize(root);
            insertionCount = this.m_tree.m_insertionCount; proxyCount = this.m_proxyCount;
        }
        queries.clear(); groups.clear();
        for (let i = 0; i < this.m_moveCount; i++) {
            const query = this.m_moveBuffer[i]; if (!query) continue;
            if (queries.has(query)) continue; queries.add(query);
            const body = query.userData.fixture.GetBody();
            let group = groups.get(body);
            if (!group) {
                group = { proxies: [], compatibleTypes: 0, lowerX: Infinity, lowerY: Infinity, upperX: -Infinity, upperY: -Infinity };
                groups.set(body, group);
            }
            group.proxies.push(query);
            group.compatibleTypes |= compatibleTypes[query.userData.fixture.GetType()];
            const bounds = query.aabb;
            group.lowerX = Math.min(group.lowerX, bounds.lowerBound.x); group.lowerY = Math.min(group.lowerY, bounds.lowerBound.y);
            group.upperX = Math.max(group.upperX, bounds.upperBound.x); group.upperY = Math.max(group.upperY, bounds.upperBound.y);
        }
        const addPair = (query: Proxy, proxy: Proxy): void => {
            if (!contactTypes[query.userData.fixture.GetType()][proxy.userData.fixture.GetType()].createFcn) return;
            if (!manager.m_contactFilter.ShouldCollide(query.userData.fixture, proxy.userData.fixture)) return;
            const proxyA = proxy.m_id < query.m_id ? proxy : query;
            const proxyB = proxy.m_id < query.m_id ? query : proxy;
            if (count === pairs.length) pairs.push({ proxyA, proxyB });
            else { pairs[count].proxyA = proxyA; pairs[count].proxyB = proxyB; }
            count++;
        };
        // 同一条动态线的所有移动片段合并成一次查询。先找到其它刚体的候选，
        // 再反查与它们重叠的移动片段；避免每个线段都从整棵世界树开始遍历。
        groups.forEach((group, body) => {
            if (root) stack.push(root);
            while (stack.length) {
                const proxy = stack.pop()!;
                const bounds = proxy.aabb;
                if (owners.get(proxy) === body || !(shapeTypes.get(proxy)! & group.compatibleTypes)
                    || bounds.lowerBound.x > group.upperX || bounds.lowerBound.y > group.upperY
                    || bounds.upperBound.x < group.lowerX || bounds.upperBound.y < group.lowerY) continue;
                if (proxy.child1) { stack.push(proxy.child1, proxy.child2!); continue; }
                // 原生工厂拒绝的形状组合已按子树类型掩码整棵跳过，避免密集切线碎片产生平方级无效对。
                if (group.proxies.length <= 8) {
                    for (const query of group.proxies) if (bounds.TestOverlap(query.aabb)) addPair(query, proxy);
                    continue;
                }
                if (root) matching.push(root);
                while (matching.length) {
                    const query = matching.pop()!, owner = owners.get(query);
                    if ((owner && owner !== body) || !query.aabb.TestOverlap(bounds)) continue;
                    if (query.child1) { matching.push(query.child1, query.child2!); continue; }
                    if (owner === body && queries.has(query)) addPair(query, proxy);
                }
            }
        });
        groups.clear(); queries.clear();
        this.m_moveCount = 0; this.m_pairCount = count; pairs.length = count;
        pairs.sort((a, b) => a.proxyA.m_id - b.proxyA.m_id || a.proxyB.m_id - b.proxyB.m_id);
        for (let i = 0; i < count;) {
            const pair = pairs[i++]; callback(pair.proxyA.userData, pair.proxyB.userData);
            while (i < count && pairs[i].proxyA.m_id === pair.proxyA.m_id && pairs[i].proxyB.m_id === pair.proxyB.m_id) i++;
        }
    };
    return () => {
        tree.MoveProxy = originalMovement;
        broad.UnBufferMove = originalRemoval; broad.UpdatePairs = originalPairs;
        manager.FindNewContacts = originalFind; manager.AddPair = originalAdd; manager.Destroy = originalDestroy;
        contacts = new WeakMap();
        owners = new WeakMap(); shapeTypes = new WeakMap(); queries.clear(); groups.clear(); stack.length = 0; matching.length = 0;
        broad.m_pairBuffer.length = 0; broad.m_pairCount = 0;
    };
}
function pairs(path: readonly number[], scale = 1): Vec2[] {
    const points: Vec2[] = []; for (let i = 0; i < path.length; i += 2) points.push(new Vec2(path[i] * scale, path[i + 1] * scale)); return points;
}
function mirrorFixtures(fixtures: readonly Fixture[], x: number, y: number): readonly Fixture[] {
    if (x === 1 && y === 1) return fixtures;
    return fixtures.map(f => f.shape === 'polygon'
        ? { ...f, paths: f.paths.map(path => path.map((v, i) => v * (i % 2 ? y : x))) }
        : { ...f, offsetX: f.offsetX * x, offsetY: f.offsetY * y });
}
/** 重复描过同一条线不应叠出多层相同接触。只合并重合几何，不改变绘制/切线采样。
 * 量化精度为 .0001 UI 像素，远小于 Box2D 的 .128 像素顶点焊接精度。
 */
function distinctLineFixtures(fixtures: readonly Fixture[]): Fixture[] {
    const keys = new Set<string>(), coordinate = (value: number): number => Math.round(value * 1e6);
    return fixtures.filter(f => {
        let key: string;
        if (f.shape === 'circle') key = `c:${coordinate(f.radius)}:${coordinate(f.offsetX)}:${coordinate(f.offsetY)}`;
        else if (f.shape === 'polygon') key = 'p:' + f.paths.map(path => {
            const vertices: string[] = [];
            for (let i = 0; i < path.length; i += 2) vertices.push(`${coordinate(path[i])},${coordinate(path[i + 1])}`);
            return vertices.sort().join(';');
        }).sort().join('|');
        else return true;
        if (keys.has(key)) return false; keys.add(key); return true;
    });
}
function polygonArea(path: readonly number[]): number {
    let area = 0; for (let i = 0; i < path.length; i += 2) { const j = (i + 2) % path.length; area += path[i] * path[j + 1] - path[j] * path[i + 1]; } return Math.abs(area) / 2;
}
function drawClosedPath(g: Graphics, points: readonly Vec2[], rounding: number): void {
    if (points.length < 3) return;
    for (let i = 0; i < points.length; i++) {
        const prev = points[(i + points.length - 1) % points.length], p = points[i], next = points[(i + 1) % points.length];
        const a = Vec2.lerp(new Vec2(), p, prev, rounding), b = Vec2.lerp(new Vec2(), p, next, rounding);
        if (!i) g.moveTo(a.x, a.y); else g.lineTo(a.x, a.y); g.quadraticCurveTo(p.x, p.y, b.x, b.y);
    }
    g.close();
}
function pointInside(point: Vec2, polygon: readonly Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i], b = polygon[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}
function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
    if (!a.length || !b.length) return false;
    if (a.some(p => pointInside(p, b)) || b.some(p => pointInside(p, a))) return true;
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++)
        if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    return false;
}
function closestPointOnPolygons(point: Vec2, polygons: readonly (readonly Vec2[])[]): Vec2 {
    let result = point.clone(), distance = Infinity;
    for (const polygon of polygons) {
        if (pointInside(point, polygon)) return point.clone();
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i], b = polygon[(i + 1) % polygon.length];
            const dx = b.x - a.x, dy = b.y - a.y;
            const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
            const candidate = new Vec2(a.x + t * dx, a.y + t * dy), d = Vec2.squaredDistance(point, candidate);
            if (d < distance) { distance = d; result = candidate; }
        }
    }
    return result;
}
function removeCollinear(points: readonly Vec2[]): Vec2[] {
    const result: Vec2[] = [];
    for (const p of points) {
        if (result.length && Vec2.squaredDistance(result[result.length - 1], p) < 1e-8) continue;
        while (result.length >= 2) {
            const a = result[result.length - 2], b = result[result.length - 1];
            const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
            const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
            if (Math.abs(cross) > 1e-5 || dot < 0) break;
            result.pop();
        }
        result.push(p);
    }
    return result;
}
function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
    const cross = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
function segmentDistance(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number {
    return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
let physicsAccumulator = 0;
export function enableBoardPhysics(enabled: boolean): void {
    const s = PhysicsSystem2D.instance; s.enable = enabled; if (enabled) s.autoSimulation = false; physicsAccumulator = 0;
}
/** 按原包固定步长推进；动态/静态接触仍使用 Box2D 默认的连续检测。 */
export function stepBoardPhysics(dt: number, board: CyBlockBeesBoard): void {
    const s = PhysicsSystem2D.instance; if (!s.enable) return;
    const world = s.physicsWorld, fixed = s.fixedTimeStep || 1 / 60;
    const stepping = s as unknown as { _steping: boolean; _delayEvents: { target: object; func: () => void }[] };
    const flush = (): void => { if (stepping._delayEvents.length) stepping._delayEvents.splice(0).forEach(e => e.func.call(e.target)); };
    // 步数必须容纳 Game 的单帧 dt 上限与上帧的余数。
    // 固定上限 4 在原版 100 Hz / 20 FPS 下会丢掉物理时间，导致机关、保护和出蜂脱节。
    const maxSteps = Math.ceil(CYBLOCKBEES_RULES.maxFrameDelta / fixed) + 1;
    physicsAccumulator = Math.min(physicsAccumulator + dt, fixed * maxSteps);
    for (let count = 0; physicsAccumulator >= fixed && count < maxSteps && s.enable; count++) {
        flush(); board.beforePhysics(fixed); board.syncSceneToPhysics(); board.applyBeeForces(fixed);
        stepping._steping = true;
        try {
            world.step(fixed, s.velocityIterations, s.positionIterations);
            // 与 Cocos postUpdate 一样，物理结果回写仍属于物理步，不能被当成新的输入变换。
            world.syncPhysicsToScene();
        }
        finally { stepping._steping = false; flush(); }
        board.afterPhysics(); physicsAccumulator = Math.max(0, physicsAccumulator - fixed);
    }
}
