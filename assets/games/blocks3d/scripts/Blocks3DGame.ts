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
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';

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
    readonly storage: StorageService;
}

interface SavedBody3D {
    readonly name: string;
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number];
    readonly velocity: readonly [number, number, number];
    readonly angularVelocity: readonly [number, number, number];
}

interface Blocks3DActiveRound {
    readonly inProgress: true;
    readonly shots: number;
    readonly toppled: readonly string[];
    readonly blocks: readonly SavedBody3D[];
    readonly balls: readonly SavedBody3D[];
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
    private playCount = 0;
    private highScore = 0;
    private saveElapsed = 0;
    private roundFinished = false;

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
        const saved = this.readSave();
        if (saved) {
            this.buildWorld(saved);
            this.context?.reportScore(this.toppled.size * 10);
            if (this.shots >= 3) this.scheduleOnce(this.finishRound, 4);
        } else {
            this.startNewRound();
        }
    }

    protected update(deltaTime: number): void {
        if (this.state !== 'playing' || this.roundFinished) {
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
                this.highScore = Math.max(this.highScore, this.toppled.size * 10);
                this.persistRound(true);
            }
        }

        this.saveElapsed += Math.max(0, deltaTime);
        if (this.saveElapsed >= 0.25) {
            this.saveElapsed = 0;
            this.persistRound(true);
        }
    }

    pause(): void {
        if (this.state !== 'playing') {
            throw new Error(`Cannot pause Blocks3DGame from ${this.state}.`);
        }

        this.state = 'paused';
        if (!this.roundFinished) this.persistRound(true);
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
        this.persistRound(false);
        this.startNewRound();
    }

    discardSavedProgress(): void {
        this.roundFinished = true;
        this.persistRound(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') {
            return;
        }

        if (!this.roundFinished && (this.state === 'playing' || this.state === 'paused')) {
            this.persistRound(true);
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

    private startNewRound(): void {
        this.roundFinished = false;
        this.playCount += 1;
        this.buildWorld();
        this.context?.reportScore(0);
        this.persistRound(true);
    }

    private buildWorld(saved?: Blocks3DActiveRound): void {
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
        this.saveElapsed = 0;
        this.roundFinished = false;

        if (saved) {
            this.restoreWorld(saved);
        }
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

        this.createBall(`Ball-${this.shots}`, new Vec3(0, 1.4, 8), new Vec3(0, 1.2, -18));
        this.shots += 1;
        this.persistRound(true);

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

        this.roundFinished = true;
        this.persistRound(false);
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

    private createBall(name: string, position: Vec3, velocity: Vec3): RigidBody | undefined {
        const world = this.node.getChildByName('World');
        if (!world) return undefined;
        const ball = new Node(name);
        ball.parent = world;
        ball.setPosition(position);
        this.applyMesh(ball, this.meshes[1], this.materials[2]);
        ball.addComponent(SphereCollider).radius = 0.5;
        const body = ball.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = 3;
        body.setLinearVelocity(velocity);
        this.dynamicBodies.push(body);
        return body;
    }

    private readSave(): Blocks3DActiveRound | undefined {
        const data = this.context?.services.storage.getGameData('blocks3d');
        this.playCount = data?.playCount ?? 0;
        this.highScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        return this.parseRound(data?.custom?.activeRound);
    }

    private parseRound(value: unknown): Blocks3DActiveRound | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const round = value as Record<string, unknown>;
        if (round.inProgress !== true
            || !Number.isInteger(round.shots) || (round.shots as number) < 0 || (round.shots as number) > 3
            || !Array.isArray(round.toppled)
            || !round.toppled.every((name) => typeof name === 'string')
            || !Array.isArray(round.blocks) || !Array.isArray(round.balls)) {
            return undefined;
        }
        const parseBodies = (items: unknown[]): SavedBody3D[] | undefined => {
            const bodies: SavedBody3D[] = [];
            for (const item of items) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
                const body = item as Record<string, unknown>;
                const isVector = (vector: unknown): vector is [number, number, number] => Array.isArray(vector)
                    && vector.length === 3
                    && vector.every((component) => typeof component === 'number' && Number.isFinite(component));
                if (typeof body.name !== 'string'
                    || !isVector(body.position) || !isVector(body.rotation)
                    || !isVector(body.velocity) || !isVector(body.angularVelocity)) return undefined;
                bodies.push(body as unknown as SavedBody3D);
            }
            return bodies;
        };
        const blocks = parseBodies(round.blocks);
        const balls = parseBodies(round.balls);
        if (!blocks || !balls) return undefined;
        return {
            inProgress: true,
            shots: round.shots as number,
            toppled: round.toppled as string[],
            blocks,
            balls,
        };
    }

    private restoreWorld(saved: Blocks3DActiveRound): void {
        const blockStates = new Map(saved.blocks.map((body) => [body.name, body]));
        for (const block of this.blocks) {
            const state = blockStates.get(block.name);
            const body = block.getComponent(RigidBody);
            if (!state || !body) continue;
            this.applyBodyState(block, body, state);
            if (saved.toppled.indexOf(block.name) !== -1) this.toppled.add(block);
        }
        for (const state of saved.balls) {
            const body = this.createBall(
                state.name,
                new Vec3(...state.position),
                new Vec3(...state.velocity),
            );
            if (body) this.applyBodyState(body.node, body, state);
        }
        this.shots = saved.shots;
    }

    private applyBodyState(node: Node, body: RigidBody, saved: SavedBody3D): void {
        node.setPosition(...saved.position);
        node.setRotationFromEuler(...saved.rotation);
        body.setLinearVelocity(new Vec3(...saved.velocity));
        body.setAngularVelocity(new Vec3(...saved.angularVelocity));
    }

    private captureBody(body: RigidBody): SavedBody3D {
        const velocity = new Vec3();
        const angularVelocity = new Vec3();
        body.getLinearVelocity(velocity);
        body.getAngularVelocity(angularVelocity);
        const position = body.node.position;
        const rotation = body.node.eulerAngles;
        return Object.freeze({
            name: body.node.name,
            position: Object.freeze([position.x, position.y, position.z]) as readonly [number, number, number],
            rotation: Object.freeze([rotation.x, rotation.y, rotation.z]) as readonly [number, number, number],
            velocity: Object.freeze([velocity.x, velocity.y, velocity.z]) as readonly [number, number, number],
            angularVelocity: Object.freeze([angularVelocity.x, angularVelocity.y, angularVelocity.z]) as readonly [number, number, number],
        });
    }

    private persistRound(inProgress: boolean): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const previous = storage.getGameData('blocks3d');
        const score = this.toppled.size * 10;
        this.highScore = Math.max(this.highScore, score);
        const blocks = this.blocks
            .map((node) => node.getComponent(RigidBody))
            .filter((body): body is RigidBody => !!body && body.node.isValid)
            .map((body) => this.captureBody(body));
        const balls = this.dynamicBodies
            .filter((body) => body.node.isValid && body.node.name.startsWith('Ball-'))
            .map((body) => this.captureBody(body));
        const activeRound = inProgress ? Object.freeze({
            inProgress: true,
            shots: this.shots,
            toppled: Object.freeze([...this.toppled].map((node) => node.name)),
            blocks: Object.freeze(blocks),
            balls: Object.freeze(balls),
        }) : Object.freeze({ inProgress: false });
        const data: GameSaveData = {
            dataVersion: 1,
            playCount: this.playCount,
            highScore: this.highScore,
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                ...(previous?.custom ?? {}),
                activeRound,
            }),
        };
        try {
            storage.writeGameData('blocks3d', data);
        } catch (error: unknown) {
            console.error('[Blocks3DGame] Save failed.', error);
        }
    }

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
