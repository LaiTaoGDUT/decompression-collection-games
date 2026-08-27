import {
    assetManager,
    BoxCollider,
    Camera,
    Collider,
    Color,
    DirectionalLight,
    ERigidBodyType,
    instantiate,
    JsonAsset,
    Material,
    MeshRenderer,
    Node,
    PhysicsMaterial,
    PhysicsSystem,
    Prefab,
    primitives,
    Quat,
    RigidBody,
    SphereCollider,
    Texture2D,
    utils,
    Vec3,
} from 'cc';
import type { DesktopCleanupGameplayConfig } from './DesktopCleanupConfig';
import type {
    DesktopCleanupItemSnapshot,
    DesktopCleanupItemType,
    DesktopCleanupShakeInput,
} from './DesktopCleanupModel';

// Cocos imports a glTF scene as a Prefab sub-asset below the source GLB path.
const MODEL_PATH = 'models/desktop-cleanup-items-v1/desktop-cleanup-items-v1';
const COLLIDER_PATH = 'models/desktop-cleanup-item-colliders-v1';
const TABLE_WIDTH = 8;
const TABLE_DEPTH = 11.3;
const TABLE_HALF_WIDTH = TABLE_WIDTH * 0.5;
const TABLE_HALF_DEPTH = TABLE_DEPTH * 0.5;
const TABLE_THICKNESS = 0.12;
const BACKDROP_WIDTH = 30;
const BACKDROP_DEPTH = 34;
const WALL_THICKNESS = 0.18;
const WALL_HEIGHT = 3.4;
// Keep the invisible contact boundary slightly inside the visible mat so a
// model's visual silhouette cannot hang over the cream edge when it settles.
const WALL_INSET = 0.36;
// Keep a model's centre well inside the invisible walls.  The extra margin is
// intentional: the visual meshes are larger than their primitive proxies, so
// a centre that is mathematically inside the wall can still draw over the
// cream mat edge after a fast contact or a stack correction.
const BODY_BOUNDS_MARGIN = 0.55;
const BODY_BOUNDS_X = TABLE_HALF_WIDTH - WALL_INSET - BODY_BOUNDS_MARGIN;
const BODY_BOUNDS_Z = TABLE_HALF_DEPTH - WALL_INSET - BODY_BOUNDS_MARGIN;
// There is no visible ceiling (the desk must remain a flat cream square), but
// a hidden gameplay ceiling prevents a solver impulse from turning a dense
// pile into a fountain above the desk.  Bodies that cross it are recycled into
// the same pop queue position instead of being allowed to leave the play mat.
const MAX_DESK_STACK_HEIGHT = 1.65;
const MAX_DESK_ANGULAR_SPEED = 18;
const TRAY_WORLD_Y = 0.46;
const TRAY_WORLD_Z = TABLE_HALF_DEPTH + 0.68;
const TRAY_TEXTURE_ASPECT = 1264 / 272;
// The first 3D pass was authored at the old sprite footprint.  Keep the
// physical proxies tied to the render scale, but give the desk objects a
// readable silhouette in the available cream playmat.
// The GLB catalogue is authored in meter-sized units.  A 0.56 multiplier made
// the individual silhouettes disappear once 162 pieces were stacked on the
// cream playmat, and also made the same node look undersized in a tray cell.
// Keep one shared scale for board, pickup and tray so the collected object is
// visibly the exact same 3D object instead of a smaller icon copy.
const ITEM_MODEL_SCALE = 0.68;
const CATALOG_ALBEDO_SCALE = new Vec3(1.30, 1.25, 1.18);
// A small neutral emissive lift keeps the shaded faces readable on the
// WebGL/微信 forward path, where the desk objects otherwise become nearly
// black when another rigid body casts a contact shadow over them.
const CATALOG_EMISSIVE = new Color(52, 48, 44, 255);
const CATALOG_EMISSIVE_SCALE = new Vec3(0.70, 0.70, 0.70);
// Keep the initial pop inside the projected cream tabletop.  Tall props can
// occupy the physical mat safely, but a spawn right at the rear edge would
// make their upper silhouette project above the mat and read like a sky drop.
// Tossing still uses the full hidden-wall area after the round starts.
const SPAWN_X_EXTENT = TABLE_WIDTH * 0.36;
// The camera is on the positive-Z side of the tabletop.  Biasing the initial
// queue toward that near/front half leaves room for tall models to grow above
// the hidden rear boundary without visually escaping the cream mat.
const SPAWN_Z_MIN = -TABLE_DEPTH * 0.08;
const SPAWN_Z_MAX = TABLE_DEPTH * 0.42;
const WORLD_RAY_DISTANCE = 80;
const ITEM_MASS = 0.34;

type DeviceTier = 'low' | 'medium' | 'high';
type ColliderShape = 'box' | 'sphere' | 'capsule';
type ColliderDirection = 'x' | 'y' | 'z';

interface ColliderSpec {
    readonly shape: ColliderShape;
    readonly center: readonly [number, number, number];
    readonly size?: readonly [number, number, number];
    readonly radius?: number;
    readonly height?: number;
    readonly direction?: ColliderDirection;
    readonly rotation?: readonly [number, number, number];
}

interface ColliderConfig {
    readonly schemaVersion: 1;
    readonly coordinateSystem: 'cocos-y-up';
    readonly items: Readonly<Record<DesktopCleanupItemType, readonly ColliderSpec[]>>;
}

interface RuntimeItem {
    readonly id: string;
    readonly type: DesktopCleanupItemType;
    readonly node: Node;
    readonly visual: Node;
    readonly body: RigidBody;
    readonly colliders: readonly Collider[];
    readonly renderers: readonly MeshRenderer[];
    spawnWave: number;
    onBoard: boolean;
    mode: 'queued' | 'board' | 'animation' | 'slot' | 'removed';
    birth?: BirthState;
}

interface BirthState {
    readonly source: Vec3;
    readonly target: Vec3;
    readonly startScale: number;
    readonly delay: number;
    elapsed: number;
}

interface FrozenBody {
    readonly linear: Vec3;
    readonly angular: Vec3;
    readonly wasAwake: boolean;
}

export interface DesktopCleanupPhysicsWorldOptions {
    readonly host: Node;
    readonly worldRoot: Node;
    readonly worldCamera: Camera;
    readonly worldLayer: number;
    readonly backdropTexture: Texture2D;
    readonly playmatTexture: Texture2D;
    readonly trayTexture: Texture2D;
    readonly config: DesktopCleanupGameplayConfig;
    readonly deviceTier: DeviceTier;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function randomBetween(minimum: number, maximum: number): number {
    return minimum + Math.random() * (maximum - minimum);
}

function randomSurfaceRotation(): Quat {
    // Keep the authored tabletop orientation stable while retaining a little
    // per-item variation.  Full 3-axis random rotations put long props
    // through the table collider at the instant they become dynamic, which is
    // what caused the previous “spawn then fly away” explosions.
    return Quat.fromEuler(
        new Quat(),
        randomBetween(-10, 10),
        randomBetween(-180, 180),
        randomBetween(-10, 10),
    );
}

function rotateBoxSize(size: Readonly<Vec3>, rotation: readonly number[]): Vec3 {
    const quaternion = Quat.fromEuler(
        new Quat(),
        rotation[0] ?? 0,
        rotation[1] ?? 0,
        rotation[2] ?? 0,
    );
    const half = new Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    const extent = new Vec3();
    for (let x = -1; x <= 1; x += 2) {
        for (let y = -1; y <= 1; y += 2) {
            for (let z = -1; z <= 1; z += 2) {
                const corner = Vec3.transformQuat(
                    new Vec3(),
                    new Vec3(half.x * x, half.y * y, half.z * z),
                    quaternion,
                );
                extent.x = Math.max(extent.x, Math.abs(corner.x));
                extent.y = Math.max(extent.y, Math.abs(corner.y));
                extent.z = Math.max(extent.z, Math.abs(corner.z));
            }
        }
    }
    return extent.multiplyScalar(2);
}

function loadPrefab(path: string): Promise<Prefab> {
    const bundle = assetManager.getBundle('game-catch-3d');
    if (!bundle) return Promise.reject(new Error('game-catch-3d bundle is not loaded.'));
    return new Promise<Prefab>((resolve, reject) => {
        bundle.load(path, Prefab, (error, asset) => {
            if (error || !asset) {
                reject(error ?? new Error(`Missing asset ${path}`));
                return;
            }
            resolve(asset);
        });
    });
}

function loadJson(path: string): Promise<JsonAsset> {
    const bundle = assetManager.getBundle('game-catch-3d');
    if (!bundle) return Promise.reject(new Error('game-catch-3d bundle is not loaded.'));
    return new Promise<JsonAsset>((resolve, reject) => {
        bundle.load(path, JsonAsset, (error, asset) => {
            if (error || !asset) {
                reject(error ?? new Error(`Missing asset ${path}`));
                return;
            }
            resolve(asset);
        });
    });
}

function findDescendant(root: Node, name: string): Node | undefined {
    if (root.name === name) return root;
    for (const child of root.children) {
        const result = findDescendant(child, name);
        if (result) return result;
    }
    return undefined;
}

export class DesktopCleanupPhysicsWorld {
    private readonly items = new Map<string, RuntimeItem>();
    private queuedItems: DesktopCleanupItemSnapshot[] = [];
    private readonly colliderOwners = new Map<Node, RuntimeItem>();
    // Renderer.material lazily creates a MaterialInstance. Keep the exact
    // renderer→instance ownership so cancelling a highlight can restore the
    // shared imported GLB material without leaking instances or touching the
    // shared asset.
    private readonly highlightedMaterials = new Map<MeshRenderer, Material>();
    private readonly physicsMaterials = new Set<PhysicsMaterial>();
    private readonly generatedMeshes = new Set<ReturnType<typeof utils.createMesh>>();
    private readonly generatedMaterials = new Set<Material>();
    private readonly catalogMaterials = new Set<Material>();
    private readonly generatedNodes = new Set<Node>();
    private readonly frozenBodies = new Map<string, FrozenBody>();
    private options?: DesktopCleanupPhysicsWorldOptions;
    private physicsSystem?: PhysicsSystem;
    private catalogPrefab?: Prefab;
    private colliderConfig?: ColliderConfig;
    private templateRoot?: Node;
    private backdropNode?: Node;
    private trayNode?: Node;
    private activeWave = -1;
    private waveElapsed = 0;
    private waveSettledFor = 0;
    private spawning = false;
    private ready = false;
    private paused = false;
    private disposed = false;
    private previousPhysicsEnabled = true;
    private previousAllowSleep = true;
    private previousGravity = new Vec3(0, -9.8, 0);
    private previousSleepThreshold = 0.1;

    async initialize(options: DesktopCleanupPhysicsWorldOptions): Promise<void> {
        this.dispose();
        this.disposed = false;
        this.paused = false;
        this.options = options;
        // RigidBody and Collider must be added below an active hierarchy so
        // their onLoad lifecycle can create the native physics backend.
        options.worldRoot.active = true;
        options.worldRoot.layer = options.worldLayer;
        options.worldCamera.node.active = true;
        options.worldCamera.node.layer = options.worldLayer;
        options.worldCamera.enabled = true;
        options.worldCamera.visibility = options.worldLayer;
        options.worldCamera.projection = Camera.ProjectionType.ORTHO;
        options.worldCamera.priority = 0;
        options.worldCamera.near = 0.1;
        options.worldCamera.far = 80;
        options.worldCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        options.worldCamera.clearColor = new Color(76, 49, 38, 255);
        options.worldCamera.node.setPosition(0, 9.5, 9.5);
        options.worldCamera.node.lookAt(new Vec3(0, 0, 0));

        const system = PhysicsSystem.instance;
        this.physicsSystem = system;
        this.previousPhysicsEnabled = system.enable;
        this.previousAllowSleep = system.allowSleep;
        this.previousGravity = system.gravity.clone();
        this.previousSleepThreshold = system.sleepThreshold;
        system.enable = true;
        system.allowSleep = true;
        system.gravity = new Vec3(0, -9.8, 0);
        system.sleepThreshold = options.config.settleLinearSpeed;

        const [catalogPrefab, colliderAsset] = await Promise.all([
            loadPrefab(MODEL_PATH),
            loadJson(COLLIDER_PATH),
        ]);
        if (this.disposed) return;
        const parsed = colliderAsset.json as unknown;
        if (!this.isColliderConfig(parsed)) {
            throw new Error('Desktop cleanup collider config is invalid.');
        }
        this.catalogPrefab = catalogPrefab;
        this.colliderConfig = parsed;
        this.templateRoot = instantiate(catalogPrefab);
        this.templateRoot.name = 'DesktopCleanupCatalogTemplates';
        this.templateRoot.active = false;
        this.templateRoot.setParent(options.worldRoot);
        this.prepareCatalogMaterials();
        this.createLighting();
        this.createBackdrop(options.backdropTexture);
        this.createTable(options.playmatTexture);
        this.createTray(options.trayTexture);
        this.createHiddenWalls();
    }

    beginRound(items: readonly DesktopCleanupItemSnapshot[]): void {
        if (!this.options || !this.templateRoot || !this.colliderConfig) {
            throw new Error('DesktopCleanupPhysicsWorld must be initialized first.');
        }
        this.releaseItems();
        this.queuedItems = items.filter((item) => item.active).slice();
        this.activeWave = -1;
        this.waveElapsed = 0;
        this.waveSettledFor = 0;
        this.spawning = true;
        this.ready = false;
        this.spawnNextWave();
    }

    update(deltaSeconds: number): void {
        if (this.disposed || this.paused || !this.options) return;
        const delta = clamp(deltaSeconds, 0, 0.05);
        this.updateItemBirths(delta);
        this.recycleInvalidBodies();
        if (!this.spawning) return;
        // A batch timeout is allowed to keep the queue moving, but the round
        // must not become interactive until the final batch has also settled.
        // `activeWave === -1` is the explicit final-settle phase.
        if (this.activeWave < 0) {
            this.waveElapsed += delta;
            if (this.allBoardItemsSettled()) {
                this.finishSpawning();
            } else if (this.waveElapsed >= this.options.config.spawnBatchTimeoutSeconds) {
                // Dense piles can keep a few contact manifolds just above the
                // sleep threshold forever. The final safe timeout converts
                // that residual jitter into a deliberate sleep (impulses can
                // still wake the bodies once input is enabled) instead of
                // blocking the round indefinitely.
                this.forceSettleBoardItems();
                this.finishSpawning();
            }
            return;
        }
        this.waveElapsed += delta;
        if (this.currentWaveSettled()) {
            this.waveSettledFor += delta;
        } else {
            this.waveSettledFor = 0;
        }
        if (this.waveSettledFor >= this.options.config.settleHoldSeconds
            || this.waveElapsed >= this.options.config.spawnBatchTimeoutSeconds) {
            this.spawnNextWave();
        }
    }

    isReady(): boolean {
        return this.ready;
    }

    getItemNode(itemId: string): Node | undefined {
        return this.items.get(itemId)?.node;
    }

    canTakeItem(itemId: string): boolean {
        const runtime = this.items.get(itemId);
        return Boolean(runtime?.node.isValid && runtime.onBoard && runtime.mode === 'board');
    }

    setCameraLayout(
        visibleWidth: number,
        visibleHeight: number,
        boardPixelSize: number,
        boardCenterY: number,
        trayCenterY: number,
        trayWidth: number,
        trayHeight: number,
    ): void {
        const camera = this.options?.worldCamera;
        if (!camera) return;
        const fraction = clamp(boardPixelSize / Math.max(1, visibleHeight), 0.25, 0.9);
        camera.orthoHeight = TABLE_WIDTH * 0.5 / fraction;
        const boardOffset = boardCenterY / Math.max(1, visibleHeight) * camera.orthoHeight * 2;
        const targetZ = boardOffset / Math.SQRT1_2;
        camera.node.setPosition(0, 9.5, 9.5 + targetZ);
        camera.node.lookAt(new Vec3(0, 0, targetZ));
        if (this.backdropNode?.isValid) this.backdropNode.setPosition(0, -0.24, targetZ);

        // The tray is part of the same 3D world as the desk, not a second UI
        // projection.  Mapping its UI rectangle through an arbitrary screen
        // plane made it drift far away on short/tall viewports.  Anchor it to
        // the desk's near edge and derive its width from the same board size;
        // this keeps the seven slots directly below the cream square on every
        // aspect ratio while preserving the existing responsive camera fit.
        void visibleWidth;
        void trayCenterY;
        void trayHeight;
        if (this.trayNode?.isValid) {
            const boardSize = Math.max(1, boardPixelSize);
            const widthRatio = clamp(trayWidth / boardSize, 0.76, 1.02);
            const trayWorldWidth = TABLE_WIDTH * widthRatio;
            this.trayNode.setPosition(0, TRAY_WORLD_Y, TRAY_WORLD_Z);
            this.trayNode.setScale(
                trayWorldWidth,
                1,
                trayWorldWidth / TRAY_TEXTURE_ASPECT,
            );
        }
    }

    screenToPlane(screenX: number, screenY: number, height = 0.56): Vec3 | undefined {
        const camera = this.options?.worldCamera;
        if (!camera) return undefined;
        const ray = camera.screenPointToRay(screenX, screenY);
        if (Math.abs(ray.d.y) < 0.000001) return undefined;
        const distance = (height - ray.o.y) / ray.d.y;
        if (!Number.isFinite(distance) || distance < 0) return undefined;
        return new Vec3(
            ray.o.x + ray.d.x * distance,
            height,
            ray.o.z + ray.d.z * distance,
        );
    }

    worldToScreen(position: Readonly<Vec3>): Vec3 | undefined {
        const camera = this.options?.worldCamera;
        return camera?.worldToScreen(position);
    }

    /**
     * Returns a slot anchor in the same world space as the textured 3D tray.
     * Keeping this anchor on the tray node avoids mixing the UI camera's
     * design-height projection with the taller runtime viewport projection.
     */
    getTraySlotWorld(
        index: number,
        capacity: number,
        slotWidthRatio = 0.92,
        height = 0.58,
    ): Vec3 | undefined {
        const tray = this.trayNode;
        if (!tray?.isValid || capacity <= 0) return undefined;
        const clampedIndex = Math.max(0, Math.min(capacity - 1, index));
        const usableWidth = Math.max(0.01, tray.scale.x * clamp(slotWidthRatio, 0.2, 1));
        const center = tray.worldPosition;
        return new Vec3(
            center.x - usableWidth * 0.5 + usableWidth * (clampedIndex + 0.5) / capacity,
            Math.max(height, center.y + 0.10),
            center.z,
        );
    }

    raycastItem(screenX: number, screenY: number): string | undefined {
        const camera = this.options?.worldCamera;
        const system = this.physicsSystem;
        if (!camera || !system || this.paused || !this.ready) return undefined;
        const ray = camera.screenPointToRay(screenX, screenY);
        const hit = system.raycastClosest(ray, 0xffffffff, WORLD_RAY_DISTANCE, false);
        if (!hit) {
            return undefined;
        }
        const collider = system.raycastClosestResult.collider;
        if (!collider) return undefined;
        let node: Node | null = collider.node;
        while (node) {
            const runtime = this.colliderOwners.get(node);
            if (runtime?.onBoard && runtime.mode === 'board') return runtime.id;
            node = node.parent;
        }
        return undefined;
    }

    takeForAnimation(itemId: string): Node | undefined {
        const runtime = this.items.get(itemId);
        if (!runtime || !runtime.onBoard || runtime.mode !== 'board') return undefined;
        runtime.onBoard = false;
        runtime.mode = 'animation';
        runtime.birth = undefined;
        runtime.body.setLinearVelocity(new Vec3());
        runtime.body.setAngularVelocity(new Vec3());
        runtime.body.useGravity = false;
        runtime.body.type = ERigidBodyType.KINEMATIC;
        runtime.colliders.forEach((collider) => {
            collider.enabled = false;
        });
        this.setHighlighted(itemId, false);
        return runtime.node;
    }

    markSlot(itemId: string): void {
        const runtime = this.items.get(itemId);
        if (!runtime) return;
        runtime.mode = 'slot';
        runtime.onBoard = false;
        runtime.birth = undefined;
    }

    removeItem(itemId: string): void {
        const runtime = this.items.get(itemId);
        if (!runtime) return;
        runtime.mode = 'removed';
        runtime.onBoard = false;
        runtime.body.enabled = false;
        runtime.colliders.forEach((collider) => {
            collider.enabled = false;
        });
        this.releaseRendererMaterials(runtime);
        this.items.delete(itemId);
        runtime.node.destroy();
    }

    shuffle(items: readonly DesktopCleanupItemSnapshot[]): void {
        const active = new Set(items.filter((item) => item.active).map((item) => item.id));
        this.items.forEach((runtime) => {
            if (!active.has(runtime.id)) return;
            runtime.spawnWave = items.find((item) => item.id === runtime.id)?.spawnWave ?? 0;
            runtime.mode = 'queued';
            runtime.onBoard = true;
            runtime.renderers.forEach((renderer) => {
                renderer.enabled = false;
            });
            runtime.body.enabled = false;
            runtime.colliders.forEach((collider) => {
                collider.enabled = false;
            });
        });
        this.activeWave = -1;
        this.waveElapsed = 0;
        this.waveSettledFor = 0;
        this.spawning = true;
        this.ready = false;
        this.spawnNextWave();
    }

    applyToss(input: DesktopCleanupShakeInput): boolean {
        const options = this.options;
        if (!options || !this.ready || this.paused) return false;
        const length = Math.hypot(input.x, input.y);
        if (!Number.isFinite(length) || length < 0.0001) return false;
        const directionX = input.x / length;
        const directionZ = -input.y / length;
        const limit = options.deviceTier === 'high'
            ? options.config.wakeLimitHigh
            : options.deviceTier === 'medium'
                ? options.config.wakeLimitMedium
                : options.config.wakeLimitLow;
        const candidates = Array.from(this.items.values())
            .filter((runtime) => runtime.onBoard && runtime.mode === 'board')
            .sort((left, right) => {
                const leftPosition = left.node.worldPosition;
                const rightPosition = right.node.worldPosition;
                const leftDirection = leftPosition.x * directionX + leftPosition.z * directionZ;
                const rightDirection = rightPosition.x * directionX + rightPosition.z * directionZ;
                const leftScore = leftPosition.y * 4 + leftDirection;
                const rightScore = rightPosition.y * 4 + rightDirection;
                return rightScore - leftScore || left.id.localeCompare(right.id);
            })
            .slice(0, limit);
        candidates.forEach((runtime, index) => {
            const exposure = 1 - index / Math.max(1, candidates.length) * 0.35;
            const strength = clamp(input.strength, 0.72, 1.25);
            runtime.body.type = ERigidBodyType.DYNAMIC;
            runtime.body.useGravity = true;
            runtime.body.enabled = true;
            runtime.colliders.forEach((collider) => {
                collider.enabled = true;
            });
            runtime.body.wakeUp();
            runtime.body.applyImpulse(new Vec3(
                directionX * options.config.tossHorizontalImpulse * strength * exposure,
                options.config.tossVerticalImpulse * strength * exposure,
                directionZ * options.config.tossHorizontalImpulse * strength * exposure,
            ));
            runtime.body.applyTorque(new Vec3(
                directionZ * 0.18 * exposure,
                (index % 2 === 0 ? 1 : -1) * 0.12 * exposure,
                -directionX * 0.18 * exposure,
            ));
        });
        return candidates.length > 0;
    }

    setHighlighted(itemId: string | undefined, highlighted: boolean): void {
        if (!itemId) return;
        const runtime = this.items.get(itemId);
        if (!runtime) return;
        runtime.renderers.forEach((renderer) => {
            if (!highlighted) {
                const material = this.highlightedMaterials.get(renderer);
                if (!material) return;
                // setSharedMaterial destroys the renderer-owned
                // MaterialInstance according to Cocos' Renderer contract.
                renderer.setSharedMaterial(renderer.sharedMaterial, 0);
                this.highlightedMaterials.delete(renderer);
                return;
            }
            const material = this.highlightedMaterials.get(renderer) ?? renderer.material;
            if (!material || material === renderer.sharedMaterial) return;
            this.highlightedMaterials.set(renderer, material);
            // The catalog uses Cocos' standard PBR effect. albedoScale is the
            // supported tint multiplier for that effect and keeps the shared
            // base-color texture intact while adding a soft selection lift.
            material.setProperty('albedoScale', new Vec3(1.18, 1.10, 0.82));
        });
    }

    pause(): void {
        if (this.paused) return;
        this.paused = true;
        this.frozenBodies.clear();
        this.items.forEach((runtime) => {
            if (!runtime.body.enabled || runtime.mode !== 'board') return;
            const linear = new Vec3();
            const angular = new Vec3();
            runtime.body.getLinearVelocity(linear);
            runtime.body.getAngularVelocity(angular);
            this.frozenBodies.set(runtime.id, {
                linear: linear.clone(),
                angular: angular.clone(),
                wasAwake: runtime.body.isAwake,
            });
            runtime.body.sleep();
        });
        if (this.physicsSystem) this.physicsSystem.enable = false;
    }

    resume(): void {
        if (!this.paused) return;
        this.paused = false;
        if (this.physicsSystem) this.physicsSystem.enable = true;
        this.frozenBodies.forEach((state, itemId) => {
            const runtime = this.items.get(itemId);
            if (!runtime?.body.enabled || runtime.mode !== 'board') return;
            runtime.body.setLinearVelocity(state.linear);
            runtime.body.setAngularVelocity(state.angular);
            if (state.wasAwake) runtime.body.wakeUp();
        });
        this.frozenBodies.clear();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.paused = true;
        this.releaseItems();
        this.templateRoot?.destroy();
        this.templateRoot = undefined;
        this.generatedNodes.forEach((node) => {
            if (node.isValid) node.destroy();
        });
        this.generatedNodes.clear();
        this.backdropNode = undefined;
        this.trayNode = undefined;
        this.highlightedMaterials.forEach((_material, renderer) => {
            if (renderer.isValid) renderer.setSharedMaterial(renderer.sharedMaterial, 0);
        });
        this.highlightedMaterials.clear();
        this.physicsMaterials.forEach((material) => material.destroy());
        this.physicsMaterials.clear();
        this.generatedMaterials.forEach((material) => material.destroy());
        this.generatedMaterials.clear();
        this.catalogMaterials.forEach((material) => material.destroy());
        this.catalogMaterials.clear();
        this.generatedMeshes.forEach((mesh) => mesh.destroy());
        this.generatedMeshes.clear();
        if (this.physicsSystem) {
            this.physicsSystem.enable = this.previousPhysicsEnabled;
            this.physicsSystem.allowSleep = this.previousAllowSleep;
            this.physicsSystem.gravity = this.previousGravity.clone();
            this.physicsSystem.sleepThreshold = this.previousSleepThreshold;
        }
        this.physicsSystem = undefined;
        this.catalogPrefab = undefined;
        this.colliderConfig = undefined;
        this.options = undefined;
        this.spawning = false;
        this.ready = false;
    }

    private createRuntimeItem(
        item: DesktopCleanupItemSnapshot,
        position: Readonly<Vec3>,
        rotation: Readonly<Quat>,
    ): RuntimeItem {
        const options = this.options!;
        const source = findDescendant(this.templateRoot!, `ITEM_${item.type}`);
        const specs = this.colliderConfig!.items[item.type];
        if (!source || !specs || specs.length < 1 || specs.length > 3) {
            throw new Error(`Incomplete 3D catalog entry for ${item.type}.`);
        }
        const node = new Node(`PhysicsItem-${item.id}`);
        node.layer = options.worldLayer;
        node.setPosition(position);
        node.setRotation(rotation);
        node.setParent(options.worldRoot);
        const visual = instantiate(source);
        visual.name = `Visual-${item.type}`;
        visual.layer = options.worldLayer;
        visual.setParent(node);
        visual.setScale(ITEM_MODEL_SCALE, ITEM_MODEL_SCALE, ITEM_MODEL_SCALE);
        visual.children
            .filter((child) => child.name.startsWith('COLLIDER_'))
            .forEach((child) => child.destroy());
        visual.getComponentsInChildren(MeshRenderer).forEach((renderer) => {
            renderer.node.layer = options.worldLayer;
        });
        const body = node.addComponent(RigidBody);
        body.type = ERigidBodyType.DYNAMIC;
        body.mass = ITEM_MASS;
        body.allowSleep = true;
        body.useGravity = true;
        body.useCCD = true;
        body.linearDamping = options.config.physicsLinearDamping;
        body.angularDamping = options.config.physicsAngularDamping;
        const material = new PhysicsMaterial();
        material.friction = options.config.physicsFriction;
        material.restitution = options.config.physicsBounce;
        this.physicsMaterials.add(material);
        const colliders = specs.map((spec, index) => (
            this.createCollider(node, item, spec, index, material)
        ));
        const runtime: RuntimeItem = {
            id: item.id,
            type: item.type,
            node,
            visual,
            body,
            colliders,
            renderers: visual.getComponentsInChildren(MeshRenderer),
            spawnWave: item.spawnWave,
            onBoard: item.active,
            mode: 'queued',
        };
        this.items.set(item.id, runtime);
        this.colliderOwners.set(node, runtime);
        colliders.forEach((collider) => {
            this.colliderOwners.set(collider.node, runtime);
        });
        return runtime;
    }

    private createCollider(
        parent: Node,
        item: DesktopCleanupItemSnapshot,
        spec: ColliderSpec,
        index: number,
        material: PhysicsMaterial,
    ): Collider {
        const center = new Vec3(
            spec.center[0] * ITEM_MODEL_SCALE,
            spec.center[1] * ITEM_MODEL_SCALE,
            spec.center[2] * ITEM_MODEL_SCALE,
        );
        const rotation = spec.rotation ?? [0, 0, 0];
        let collider: Collider;
        if (spec.shape === 'sphere') {
            const sphere = parent.addComponent(SphereCollider);
            sphere.radius = (spec.radius ?? 0.5) * ITEM_MODEL_SCALE;
            collider = sphere;
        } else if (spec.shape === 'capsule') {
            // Cannon.js has no capsule shape. Preserve old collider configs
            // with an explicit primitive box approximation rather than
            // creating an unsupported component.
            const radius = (spec.radius ?? 0.25) * ITEM_MODEL_SCALE;
            const height = Math.max(radius * 2, (spec.height ?? 1) * ITEM_MODEL_SCALE);
            const box = parent.addComponent(BoxCollider);
            const baseSize = spec.direction === 'x'
                ? new Vec3(height, radius * 2, radius * 2)
                : spec.direction === 'z'
                    ? new Vec3(radius * 2, radius * 2, height)
                    : new Vec3(radius * 2, height, radius * 2);
            box.size = rotateBoxSize(baseSize, rotation);
            collider = box;
        } else {
            const box = parent.addComponent(BoxCollider);
            const size = spec.size ?? [1, 1, 1];
            box.size = rotateBoxSize(new Vec3(
                size[0] * ITEM_MODEL_SCALE,
                size[1] * ITEM_MODEL_SCALE,
                size[2] * ITEM_MODEL_SCALE,
            ), rotation);
            collider = box;
        }
        collider.center = center;
        collider.sharedMaterial = material;
        collider.enabled = false;
        return collider;
    }

    private spawnNextWave(): void {
        const options = this.options;
        if (!options) return;
        const queuedWaves = Array.from(new Set(
            Array.from(this.items.values())
                .filter((runtime) => runtime.mode === 'queued' && runtime.onBoard)
                .map((runtime) => runtime.spawnWave)
                .concat(this.queuedItems.map((item) => item.spawnWave)),
        )).sort((left, right) => left - right);
        const nextWave = queuedWaves[0];
        if (nextWave === undefined) {
            if (!this.allBoardItemsSettled()) {
                this.activeWave = -1;
                this.waveElapsed = 0;
                this.waveSettledFor = 0;
                this.spawning = true;
                return;
            }
            this.finishSpawning();
            return;
        }
        this.activeWave = nextWave;
        this.waveElapsed = 0;
        this.waveSettledFor = 0;
        const existingWaveItems = Array.from(this.items.values())
            .filter((runtime) => runtime.mode === 'queued'
                && runtime.onBoard
                && runtime.spawnWave === nextWave);
        const newWaveSnapshots = this.queuedItems.filter((item) => item.spawnWave === nextWave);
        this.queuedItems = this.queuedItems.filter((item) => item.spawnWave !== nextWave);
        const newWaveItems = newWaveSnapshots.map((item) => {
            // The node is initially hidden below the tabletop.  It becomes a
            // proper rigid body only after its short pop animation completes.
            const position = new Vec3(0, options.config.spawnPopStartHeight, 0);
            const rotation = randomSurfaceRotation();
            return this.createRuntimeItem(item, position, rotation);
        });
        const waveItems = existingWaveItems.concat(newWaveItems);
        waveItems.forEach((runtime, index) => {
            runtime.mode = 'board';
            const target = new Vec3(
                randomBetween(-SPAWN_X_EXTENT, SPAWN_X_EXTENT),
                options.config.spawnPopTargetHeight + randomBetween(-0.04, 0.06),
                randomBetween(SPAWN_Z_MIN, SPAWN_Z_MAX),
            );
            const source = new Vec3(
                target.x * 0.22 + randomBetween(-0.16, 0.16),
                options.config.spawnPopStartHeight,
                target.z * 0.22 + randomBetween(-0.16, 0.16),
            );
            this.beginItemBirth(runtime, source, target, index);
        });
    }

    private beginItemBirth(
        runtime: RuntimeItem,
        source: Readonly<Vec3>,
        target: Readonly<Vec3>,
        index: number,
    ): void {
        const options = this.options;
        if (!options) return;
        runtime.birth = {
            source: source.clone(),
            target: target.clone(),
            startScale: options.config.spawnPopStartScale,
            delay: index * options.config.spawnPopStaggerSeconds,
            elapsed: 0,
        };
        runtime.node.setPosition(source);
        runtime.visual.setScale(
            ITEM_MODEL_SCALE * options.config.spawnPopStartScale,
            ITEM_MODEL_SCALE * options.config.spawnPopStartScale,
            ITEM_MODEL_SCALE * options.config.spawnPopStartScale,
        );
        runtime.renderers.forEach((renderer) => {
            renderer.enabled = true;
        });
        runtime.body.enabled = true;
        runtime.body.type = ERigidBodyType.KINEMATIC;
        runtime.body.useGravity = false;
        runtime.body.setLinearVelocity(new Vec3());
        runtime.body.setAngularVelocity(new Vec3());
        runtime.colliders.forEach((collider) => {
            collider.enabled = false;
        });
    }

    private updateItemBirths(delta: number): void {
        const options = this.options;
        if (!options) return;
        const duration = Math.max(0.04, options.config.spawnPopDurationSeconds);
        this.items.forEach((runtime) => {
            const birth = runtime.birth;
            if (!birth || runtime.mode !== 'board' || !runtime.onBoard) return;
            birth.elapsed += delta;
            if (birth.elapsed < birth.delay) return;
            const progress = clamp((birth.elapsed - birth.delay) / duration, 0, 1);
            // Ease-out cubic gives a quick, legible emergence without the
            // slow high-altitude fall that the first pass used.
            const eased = 1 - Math.pow(1 - progress, 3);
            runtime.node.setPosition(
                birth.source.x + (birth.target.x - birth.source.x) * eased,
                birth.source.y + (birth.target.y - birth.source.y) * eased,
                birth.source.z + (birth.target.z - birth.source.z) * eased,
            );
            const scaleFactor = birth.startScale + (1 - birth.startScale) * eased;
            runtime.visual.setScale(
                ITEM_MODEL_SCALE * scaleFactor,
                ITEM_MODEL_SCALE * scaleFactor,
                ITEM_MODEL_SCALE * scaleFactor,
            );
            if (progress < 1) return;
            runtime.birth = undefined;
            runtime.visual.setScale(ITEM_MODEL_SCALE, ITEM_MODEL_SCALE, ITEM_MODEL_SCALE);
            runtime.body.type = ERigidBodyType.DYNAMIC;
            runtime.body.useGravity = true;
            runtime.colliders.forEach((collider) => {
                collider.enabled = true;
            });
            runtime.body.setLinearVelocity(new Vec3(0, -0.08, 0));
            runtime.body.setAngularVelocity(new Vec3(
                randomBetween(-0.28, 0.28),
                randomBetween(-0.42, 0.42),
                randomBetween(-0.28, 0.28),
            ));
            runtime.body.wakeUp();
        });
    }

    private currentWaveSettled(): boolean {
        const options = this.options;
        if (!options) return true;
        const current = Array.from(this.items.values()).filter((runtime) => (
            runtime.mode === 'board'
            && runtime.onBoard
            && runtime.spawnWave === this.activeWave
        ));
        return current.every((runtime) => this.isRuntimeSettled(runtime, options.config));
    }

    private allBoardItemsSettled(): boolean {
        const options = this.options;
        if (!options) return true;
        return Array.from(this.items.values())
            .filter((runtime) => runtime.mode === 'board' && runtime.onBoard)
            .every((runtime) => this.isRuntimeSettled(runtime, options.config));
    }

    private isRuntimeSettled(
        runtime: RuntimeItem,
        config: DesktopCleanupGameplayConfig,
    ): boolean {
        if (runtime.birth) return false;
        if (runtime.body.isSleeping) return true;
        const linear = new Vec3();
        const angular = new Vec3();
        runtime.body.getLinearVelocity(linear);
        runtime.body.getAngularVelocity(angular);
        return linear.length() <= config.settleLinearSpeed
            && angular.length() <= config.settleAngularSpeed;
    }

    private finishSpawning(): void {
        this.spawning = false;
        this.ready = true;
        this.activeWave = -1;
        this.items.forEach((runtime) => {
            if (runtime.mode === 'board' && runtime.body.isSleepy) runtime.body.sleep();
        });
    }

    private forceSettleBoardItems(): void {
        const zero = new Vec3();
        this.items.forEach((runtime) => {
            if (runtime.mode !== 'board' || !runtime.onBoard || !runtime.body.enabled) return;
            if (runtime.birth) {
                runtime.node.setPosition(runtime.birth.target);
                runtime.visual.setScale(ITEM_MODEL_SCALE, ITEM_MODEL_SCALE, ITEM_MODEL_SCALE);
                runtime.birth = undefined;
                runtime.body.type = ERigidBodyType.DYNAMIC;
                runtime.body.useGravity = true;
                runtime.colliders.forEach((collider) => {
                    collider.enabled = true;
                });
            }
            runtime.body.setLinearVelocity(zero);
            runtime.body.setAngularVelocity(zero);
            runtime.body.sleep();
        });
    }

    private recycleInvalidBodies(): void {
        const options = this.options;
        if (!options) return;
        this.items.forEach((runtime) => {
            if (!runtime.onBoard || runtime.mode !== 'board' || !runtime.body.enabled) return;
            const position = runtime.node.position;
            const velocity = new Vec3();
            const angular = new Vec3();
            runtime.body.getLinearVelocity(velocity);
            runtime.body.getAngularVelocity(angular);
            const outsideX = Math.abs(position.x) > BODY_BOUNDS_X;
            const outsideZ = Math.abs(position.z) > BODY_BOUNDS_Z;
            const invalid = position.y < options.config.recycleBelowY
                || position.y > MAX_DESK_STACK_HEIGHT
                || Math.abs(position.x) > TABLE_HALF_WIDTH + 0.20
                || Math.abs(position.z) > TABLE_HALF_DEPTH + 0.20
                || velocity.length() > options.config.recycleMaxSpeed
                || angular.length() > MAX_DESK_ANGULAR_SPEED
                || !Number.isFinite(position.x + position.y + position.z);
            if (!invalid && !outsideX && !outsideZ) return;

            // First contain ordinary wall overshoot without destroying the
            // current stack.  A genuinely invalid/high-speed body is reset to
            // a safe tabletop point so it cannot disappear off-screen.
            if (!invalid && (outsideX || outsideZ)) {
                const nextPosition = new Vec3(
                    clamp(position.x, -BODY_BOUNDS_X, BODY_BOUNDS_X),
                    clamp(position.y, 0.18, MAX_DESK_STACK_HEIGHT),
                    clamp(position.z, -BODY_BOUNDS_Z, BODY_BOUNDS_Z),
                );
                runtime.node.setPosition(nextPosition);
                if (outsideX && ((nextPosition.x <= -BODY_BOUNDS_X && velocity.x < 0)
                    || (nextPosition.x >= BODY_BOUNDS_X && velocity.x > 0))) {
                    velocity.x = 0;
                }
                if (outsideZ && ((nextPosition.z <= -BODY_BOUNDS_Z && velocity.z < 0)
                    || (nextPosition.z >= BODY_BOUNDS_Z && velocity.z > 0))) {
                    velocity.z = 0;
                }
                runtime.body.setLinearVelocity(velocity);
                runtime.body.wakeUp();
                return;
            }

            runtime.node.setPosition(
                randomBetween(-BODY_BOUNDS_X * 0.72, BODY_BOUNDS_X * 0.72),
                clamp(options.config.recycleHeight, 0.22, 1.05),
                randomBetween(-BODY_BOUNDS_Z * 0.48, BODY_BOUNDS_Z * 0.48),
            );
            runtime.node.setRotation(randomSurfaceRotation());
            runtime.body.setLinearVelocity(new Vec3());
            runtime.body.setAngularVelocity(new Vec3());
            runtime.body.wakeUp();
        });
    }

    private createLighting(): void {
        const options = this.options!;
        const lightNode = new Node('DesktopCleanupWorldLight');
        this.generatedNodes.add(lightNode);
        lightNode.layer = options.worldLayer;
        lightNode.setParent(options.worldRoot);
        // A warm key from the player's front-right-upper corner gives the
        // low-poly props a readable face and a soft contact gradient shared by
        // the tabletop and tray world.  Pointing the node at the desk is more
        // reliable than hand-authored Euler angles across Cocos backends.
        lightNode.setPosition(5, 12, 10);
        lightNode.lookAt(new Vec3(0, 0, 0));
        const light = lightNode.addComponent(DirectionalLight);
        light.color = new Color(255, 239, 215, 255);
        light.illuminance = 30000;
        // Keep the directional key shadowless: on mobile WebGL its shadow map
        // turns the small low-poly side faces into solid black patches.
        light.shadowEnabled = false;

        // A single key light made the lower faces of the low-poly props read
        // nearly black on mobile WebGL.  This broad, shadowless fill keeps the
        // baked clay colors legible without changing the cream tabletop look.
        const fillNode = new Node('DesktopCleanupWorldFillLight');
        this.generatedNodes.add(fillNode);
        fillNode.layer = options.worldLayer;
        fillNode.setParent(options.worldRoot);
        fillNode.setPosition(-6, 8, -4);
        fillNode.lookAt(new Vec3(0, 0, 0));
        const fill = fillNode.addComponent(DirectionalLight);
        fill.color = new Color(255, 248, 236, 255);
        fill.illuminance = 10000;
        fill.shadowEnabled = false;
    }

    private prepareCatalogMaterials(): void {
        const template = this.templateRoot;
        if (!template) return;
        const copies = new Map<Material, Material>();
        template.getComponentsInChildren(MeshRenderer).forEach((renderer) => {
            const source = renderer.sharedMaterial;
            if (!source) return;
            let copy = copies.get(source);
            if (!copy) {
                copy = new Material();
                copy.copy(source);
                // Keep the imported standard PBR material (and therefore its
                // real 3D normals/shadows), but lift the shared albedo once
                // instead of allocating a material instance per object.
                copy.setProperty('albedoScale', CATALOG_ALBEDO_SCALE);
                copy.setProperty('emissive', CATALOG_EMISSIVE);
                copy.setProperty('emissiveScale', CATALOG_EMISSIVE_SCALE);
                copy.setProperty('mainColor', Color.WHITE);
                copies.set(source, copy);
                this.catalogMaterials.add(copy);
            }
            renderer.setSharedMaterial(copy, 0);
        });
    }

    private createBackdrop(texture: Texture2D): void {
        const options = this.options!;
        const node = new Node('DesktopCleanupWalnutBackdrop');
        this.generatedNodes.add(node);
        this.backdropNode = node;
        node.layer = options.worldLayer;
        node.setParent(options.worldRoot);
        node.setPosition(0, -0.24, 0);
        const renderer = node.addComponent(MeshRenderer);
        const mesh = utils.createMesh(primitives.box({
            width: BACKDROP_WIDTH,
            height: 0.08,
            length: BACKDROP_DEPTH,
        }));
        this.generatedMeshes.add(mesh);
        renderer.mesh = mesh;
        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_TEXTURE: true },
        });
        material.setProperty('mainColor', Color.WHITE);
        material.setProperty('mainTexture', texture);
        renderer.setMaterial(material, 0);
        this.generatedMaterials.add(material);
    }

    private createTray(texture: Texture2D): void {
        const options = this.options!;
        const node = new Node('DesktopCleanupSlotTray');
        this.generatedNodes.add(node);
        this.trayNode = node;
        node.layer = options.worldLayer;
        node.setParent(options.worldRoot);
        const renderer = node.addComponent(MeshRenderer);
        // Use a single horizontal face.  A textured box repeats the tray art
        // on its four side faces and reads as two thin horizontal rules above
        // and below the tray on the oblique camera.
        const mesh = utils.createMesh(primitives.plane({ width: 1, length: 1, widthSegments: 1, lengthSegments: 1 }));
        this.generatedMeshes.add(mesh);
        renderer.mesh = mesh;
        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: { USE_TEXTURE: true },
        });
        material.setProperty('mainColor', Color.WHITE);
        material.setProperty('mainTexture', texture);
        renderer.setMaterial(material, 0);
        this.generatedMaterials.add(material);
    }

    private createTable(texture: Texture2D): void {
        const options = this.options!;
        const node = new Node('DesktopCleanupCreamTable');
        this.generatedNodes.add(node);
        node.layer = options.worldLayer;
        node.setParent(options.worldRoot);
        node.setPosition(0, 0.002, 0);
        const renderer = node.addComponent(MeshRenderer);
        // Keep the visual desk as the original cream square, but render only
        // its top face.  The old textured box exposed its side UVs as two
        // detached cream lines between the desk and the slot tray.
        const mesh = utils.createMesh(primitives.plane({
            width: TABLE_WIDTH,
            length: TABLE_DEPTH,
            widthSegments: 1,
            lengthSegments: 1,
        }));
        this.generatedMeshes.add(mesh);
        renderer.mesh = mesh;
        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            technique: 1,
            defines: { USE_TEXTURE: true },
        });
        material.setProperty('mainColor', Color.WHITE);
        material.setProperty('mainTexture', texture);
        renderer.setMaterial(material, 0);
        this.generatedMaterials.add(material);
        const body = node.addComponent(RigidBody);
        body.type = ERigidBodyType.STATIC;
        const collider = node.addComponent(BoxCollider);
        collider.size = new Vec3(TABLE_WIDTH, TABLE_THICKNESS, TABLE_DEPTH);
        collider.center = new Vec3(0, -TABLE_THICKNESS * 0.5, 0);
        const physicsMaterial = new PhysicsMaterial();
        physicsMaterial.friction = options.config.physicsFriction;
        physicsMaterial.restitution = options.config.physicsBounce;
        collider.sharedMaterial = physicsMaterial;
        this.physicsMaterials.add(physicsMaterial);
    }

    private createHiddenWalls(): void {
        this.createStaticWall(
            'WallLeft',
            new Vec3(
                -(TABLE_HALF_WIDTH - WALL_INSET - WALL_THICKNESS * 0.5),
                WALL_HEIGHT * 0.5,
                0,
            ),
            new Vec3(WALL_THICKNESS, WALL_HEIGHT, TABLE_DEPTH),
        );
        this.createStaticWall(
            'WallRight',
            new Vec3(
                TABLE_HALF_WIDTH - WALL_INSET - WALL_THICKNESS * 0.5,
                WALL_HEIGHT * 0.5,
                0,
            ),
            new Vec3(WALL_THICKNESS, WALL_HEIGHT, TABLE_DEPTH),
        );
        this.createStaticWall(
            'WallBack',
            new Vec3(
                0,
                WALL_HEIGHT * 0.5,
                -(TABLE_HALF_DEPTH - WALL_INSET - WALL_THICKNESS * 0.5),
            ),
            new Vec3(TABLE_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
        );
        this.createStaticWall(
            'WallFront',
            new Vec3(
                0,
                WALL_HEIGHT * 0.5,
                TABLE_HALF_DEPTH - WALL_INSET - WALL_THICKNESS * 0.5,
            ),
            new Vec3(TABLE_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
        );
    }

    private createStaticWall(name: string, position: Vec3, size: Vec3): void {
        const node = new Node(name);
        this.generatedNodes.add(node);
        node.layer = this.options!.worldLayer;
        node.setParent(this.options!.worldRoot);
        node.setPosition(position);
        const body = node.addComponent(RigidBody);
        body.type = ERigidBodyType.STATIC;
        const collider = node.addComponent(BoxCollider);
        collider.size = size;
        const physicsMaterial = new PhysicsMaterial();
        physicsMaterial.friction = this.options!.config.physicsFriction;
        // A wall should contain a tossed item, not turn the wall contact into
        // a second launch pad.  Keep the desk's soft restitution but remove
        // the tiny solver bounce that accumulates at four boundaries.
        physicsMaterial.restitution = Math.min(0.04, this.options!.config.physicsBounce);
        collider.sharedMaterial = physicsMaterial;
        this.physicsMaterials.add(physicsMaterial);
    }

    private releaseRendererMaterials(runtime: RuntimeItem): void {
        runtime.renderers.forEach((renderer) => {
            if (!this.highlightedMaterials.has(renderer)) return;
            renderer.setSharedMaterial(renderer.sharedMaterial, 0);
            this.highlightedMaterials.delete(renderer);
        });
    }

    private releaseItems(): void {
        this.items.forEach((runtime) => {
            runtime.body.sleep();
            this.releaseRendererMaterials(runtime);
            runtime.node.destroy();
        });
        this.items.clear();
        this.queuedItems = [];
        this.colliderOwners.clear();
        this.frozenBodies.clear();
    }

    private isColliderConfig(value: unknown): value is ColliderConfig {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        const record = value as Record<string, unknown>;
        if (record.schemaVersion !== 1 || record.coordinateSystem !== 'cocos-y-up') return false;
        if (typeof record.items !== 'object' || record.items === null) return false;
        const entries = record.items as Record<string, unknown>;
        return Object.keys(entries).length === 20
            && Object.keys(entries).every((key) => (
                Array.isArray(entries[key])
                && (entries[key] as unknown[]).length >= 1
                && (entries[key] as unknown[]).length <= 3
            ));
    }
}
