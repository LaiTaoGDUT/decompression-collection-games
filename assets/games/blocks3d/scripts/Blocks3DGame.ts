import {
    _decorator,
    BoxCollider,
    Color,
    Component,
    DirectionalLight,
    ERigidBodyType,
    EventKeyboard,
    input,
    Input,
    KeyCode,
    Material,
    Mesh,
    MeshRenderer,
    Node,
    primitives,
    RigidBody,
    SphereCollider,
    utils,
    Vec3,
} from 'cc';
import type { DevicePerformanceTier } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext } from '../../../runtime/MiniGame';

const { ccclass } = _decorator;

export interface Blocks3DQualityProfile {
    readonly tier: DevicePerformanceTier;
    readonly blockCount: number;
    readonly shadows: boolean;
    readonly sphereSegments: number;
}

export const BLOCKS_3D_QUALITY: Readonly<
    Record<DevicePerformanceTier, Blocks3DQualityProfile>
> = Object.freeze({
    low: Object.freeze({
        tier: 'low',
        blockCount: 6,
        shadows: false,
        sphereSegments: 12,
    }),
    medium: Object.freeze({
        tier: 'medium',
        blockCount: 10,
        shadows: false,
        sphereSegments: 16,
    }),
    high: Object.freeze({
        tier: 'high',
        blockCount: 15,
        shadows: true,
        sphereSegments: 24,
    }),
});

export function getBlocks3DQuality(
    tier: DevicePerformanceTier,
): Blocks3DQualityProfile {
    return BLOCKS_3D_QUALITY[tier];
}

interface Blocks3DServices {
    readonly deviceProfile?: Readonly<{ tier: DevicePerformanceTier }>;
}

type BlocksState = 'idle' | 'ready' | 'playing' | 'paused' | 'disposed';

/** 极简3D验证游戏：点击发射球，推倒积木后提交标准结果。 */
@ccclass('Blocks3DGame')
export class Blocks3DGame extends Component implements MiniGame {
    private state: BlocksState = 'idle';
    private context?: MiniGameContext<Blocks3DServices>;
    private profile = BLOCKS_3D_QUALITY.medium;
    private materials: Material[] = [];
    private meshes: Mesh[] = [];
    private dynamicBodies: RigidBody[] = [];
    private blocks: Node[] = [];
    private toppled = new Set<Node>();
    private shots = 0;

    async initialize(context: MiniGameContext<Blocks3DServices>): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`Cannot initialize Blocks3DGame from ${this.state}.`);
        }

        this.context = context;
        this.profile = getBlocks3DQuality(
            context.services.deviceProfile?.tier ?? 'medium',
        );
        this.prewarmShaderAssets();
        const light = this.node.getChildByName('MainLight')
            ?.getComponent(DirectionalLight);

        if (light) {
            light.shadowEnabled = this.profile.shadows;
        }

        input.on(Input.EventType.TOUCH_END, this.handleLaunch, this);
        input.on(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') {
            throw new Error(`Cannot begin Blocks3DGame from ${this.state}.`);
        }

        this.state = 'playing';
        this.buildWorld();
        this.context?.reportScore(0);
    }

    protected update(): void {
        if (this.state !== 'playing') {
            return;
        }

        for (const block of this.blocks) {
            if (this.toppled.has(block) || !block.isValid) {
                continue;
            }

            const rotation = block.eulerAngles;

            if (Math.abs(rotation.x) > 25
                || Math.abs(rotation.z) > 25
                || block.position.y < 0.25) {
                this.toppled.add(block);
                this.context?.reportScore(this.toppled.size * 10);
            }
        }
    }

    pause(): void {
        if (this.state !== 'playing') {
            throw new Error(`Cannot pause Blocks3DGame from ${this.state}.`);
        }

        this.state = 'paused';
        this.setBodiesEnabled(false);
    }

    resume(): void {
        if (this.state !== 'paused') {
            throw new Error(`Cannot resume Blocks3DGame from ${this.state}.`);
        }

        this.state = 'playing';
        this.setBodiesEnabled(true);
    }

    async restart(): Promise<void> {
        if (this.state !== 'playing' && this.state !== 'paused') {
            throw new Error(`Cannot restart Blocks3DGame from ${this.state}.`);
        }

        this.unscheduleAllCallbacks();
        this.state = 'playing';
        this.buildWorld();
        this.context?.reportScore(0);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') {
            return;
        }

        this.unscheduleAllCallbacks();
        input.off(Input.EventType.TOUCH_END, this.handleLaunch, this);
        input.off(Input.EventType.KEY_UP, this.handleKeyUp, this);
        this.clearWorld();

        for (const material of this.materials.splice(0)) {
            material.destroy();
        }

        for (const mesh of this.meshes.splice(0)) {
            mesh.destroy();
        }

        this.context = undefined;
        this.state = 'disposed';
    }

    private prewarmShaderAssets(): void {
        const ground = this.createMaterial(new Color(76, 108, 82, 255));
        const block = this.createMaterial(new Color(231, 139, 71, 255));
        const ball = this.createMaterial(new Color(78, 141, 232, 255));
        this.materials.push(ground, block, ball);
        this.meshes.push(
            utils.createMesh(primitives.box()),
            utils.createMesh(primitives.sphere(0.5, {
                segments: this.profile.sphereSegments,
            })),
        );
    }

    private createMaterial(color: Color): Material {
        const material = new Material();
        // `builtin-standard` needs scene-lighting passes that are not available
        // for this runtime-created material in the preview renderer.  A colored
        // unlit material is sufficient for this game and explicitly creates its
        // color pass, so MeshRenderer never receives a null pass list.
        material.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_COLOR: true },
            technique: 0,
        });
        material.setProperty('mainColor', color);
        return material;
    }

    private buildWorld(): void {
        this.clearWorld();
        const world = this.node.getChildByName('World');

        if (!world) {
            throw new Error('Blocks3D World node is missing.');
        }

        const ground = new Node('Ground');
        ground.parent = world;
        ground.setPosition(0, -0.25, 0);
        ground.setScale(14, 0.5, 18);
        this.applyMesh(ground, this.meshes[0], this.materials[0]);
        ground.addComponent(BoxCollider);
        const groundBody = ground.addComponent(RigidBody);
        groundBody.type = ERigidBodyType.STATIC;

        for (let index = 0; index < this.profile.blockCount; index += 1) {
            const block = new Node(`Block-${index}`);
            block.parent = world;
            const column = index % 3;
            const row = Math.floor(index / 3);
            block.setPosition((column - 1) * 1.25, 0.9 + row * 1.85, 0);
            block.setScale(1, 1.7, 0.65);
            this.applyMesh(block, this.meshes[0], this.materials[1]);
            block.addComponent(BoxCollider);
            const body = block.addComponent(RigidBody);
            body.type = ERigidBodyType.DYNAMIC;
            body.mass = 1.2;
            this.dynamicBodies.push(body);
            this.blocks.push(block);
        }

        this.shots = 0;
        this.toppled.clear();
    }

    private applyMesh(node: Node, mesh: Mesh, material: Material): void {
        const renderer = node.addComponent(MeshRenderer);
        // MeshRenderer creates its sub-model when `mesh` is assigned.  It needs
        // a material already present at that point; otherwise Cocos attempts to
        // access an undefined material layout (localSetLayout).
        renderer.setSharedMaterial(material, 0);
        renderer.mesh = mesh;
        // Force the newly-created sub-model to take the prepared pass list.
        renderer.setSharedMaterial(material, 0, true);
        renderer.shadowCastingMode = this.profile.shadows ? 1 : 0;
        renderer.receiveShadow = this.profile.shadows ? 1 : 0;
    }

    private readonly handleLaunch = (): void => {
        if (this.state !== 'playing' || this.shots >= 3) {
            return;
        }

        const world = this.node.getChildByName('World');

        if (!world) {
            return;
        }

        const ball = new Node(`Ball-${this.shots}`);
        ball.parent = world;
        ball.setPosition(0, 1.4, 8);
        this.applyMesh(ball, this.meshes[1], this.materials[2]);
        ball.addComponent(SphereCollider).radius = 0.5;
        const body = ball.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = 3;
        body.setLinearVelocity(new Vec3(0, 1.2, -18));
        this.dynamicBodies.push(body);
        this.shots += 1;

        if (this.shots === 3) {
            this.scheduleOnce(this.finishRound, 4);
        }
    };

    private readonly handleKeyUp = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE && this.state === 'playing') {
            this.context?.requestPause();
        }
    };

    private readonly finishRound = (): void => {
        if (this.state !== 'playing') {
            return;
        }

        this.context?.requestExit({
            score: this.toppled.size * 10,
            duration: 0,
            completed: true,
            extra: Object.freeze({
                toppledBlocks: this.toppled.size,
                qualityTier: this.profile.tier,
            }),
        });
    };

    private setBodiesEnabled(enabled: boolean): void {
        for (const body of this.dynamicBodies) {
            if (body.node.isValid) {
                body.enabled = enabled;
            }
        }
    }

    private clearWorld(): void {
        const world = this.node.getChildByName('World');

        if (world) {
            for (const child of [...world.children]) {
                child.destroy();
            }
        }

        this.dynamicBodies = [];
        this.blocks = [];
        this.toppled.clear();
        this.shots = 0;
    }
}
