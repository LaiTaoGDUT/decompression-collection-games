import {
    _decorator,
    assetManager,
    BoxCollider2D,
    Button,
    Color,
    Component,
    director,
    Director,
    EventTouch,
    Graphics,
    input,
    Input,
    JsonAsset,
    Label,
    Node,
    RigidBody2D,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { DevicePerformanceTier, GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { Platform } from '../../../platform/Platform';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import {
    AD_PLACEMENTS,
    type AdService,
} from '../../../services/ads/AdService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type {
    GameSaveData,
    StorageService,
} from '../../../services/storage/StorageService';
import {
    autoAtlasFrameName,
    loadAutoAtlasFrames,
} from '../../../services/asset/AutoAtlasLoader';
import {
    CAT_TOKEN_VISIBLE_DIAMETER_RATIO,
    FRUIT_LEVELS,
    configureFruitCatalog,
    getFruitConfig,
} from './FruitCatalog';
import { FruitBody } from './FruitBody';
import { OverflowGuard } from './WatermelonDanger';
import { SingleContinueRule } from './WatermelonContinueRule';
import {
    createStartedWatermelonSave,
    normalizeWatermelonSave,
    refreshCompletedWatermelonSave,
    WATERMELON_DATA_VERSION,
} from './WatermelonSave';
import { SinglePointerDropController } from './WatermelonInput';
import { clampDropX } from './WatermelonPhysicsRules';
import {
    WatermelonRoundProgress,
    type WatermelonMergeScoreEvent,
    type WatermelonProgressSnapshot,
} from './WatermelonScoring';
import {
    chooseWeightedInitialLevel,
    DEFAULT_WATERMELON_GAMEPLAY_CONFIG,
    requireWatermelonGameplayConfig,
    type WatermelonGameplayConfig,
} from './WatermelonGameplayConfig';
import { WatermelonOverlayView } from './WatermelonOverlayView';
import {
    destroyWatermelonPopupFrames,
    loadWatermelonPopupFrames,
    type WatermelonPopupFrames,
} from './WatermelonPopupAssets';
import {
    WATERMELON_BOARD_HEIGHT,
    WATERMELON_BOARD_BOTTOM_PADDING,
    WATERMELON_BOARD_INNER_PADDING,
    WATERMELON_BOARD_SIDE_PADDING,
    WATERMELON_BOARD_WIDTH,
    WATERMELON_BOARD_WALL_THICKNESS,
    WatermelonLayout,
} from './WatermelonLayout';
import { catUiColor } from './WatermelonUiTheme';
import {
    WatermelonFluidWorld,
    type WatermelonFluidBody,
    type WatermelonFluidMergeEvent,
} from './WatermelonFluidWorld';
import { WATERMELON_SEMI_FLUID } from './WatermelonSemiFluid';

const { ccclass } = _decorator;
type WatermelonState = 'idle' | 'ready' | 'playing' | 'paused' | 'disposed';

const WATERMELON_RESOURCE_BUNDLE = 'game-watermelon-assets';
const WATERMELON_CAT_ATLAS_PATH = 'visual/cats/frames-c6/watermelon-cat-frames';
const NEXT_CAT_PREVIEW_SIZE = 56;
const CAT_DROP_TOP_GAP = 8;
const ROUND_SAVE_INTERVAL_SECONDS = 3;
const DROP_SAVE_QUIET_SECONDS = 2.4;
const STIR_SAVE_QUIET_SECONDS = 3;
const MERGE_SAVE_QUIET_SECONDS = 1.2;
const FLUID_FIXED_STEP_SECONDS = 1 / WATERMELON_SEMI_FLUID.simulationHz;
const MAX_FLUID_STEPS_PER_FRAME = 2;
const MERGE_SCORE_FONT_SIZE = 38;
const MERGE_CHAIN_SCORE_FONT_SIZE = 42;
const MERGE_SCORE_LINE_HEIGHT = 48;
const MERGE_CHAIN_SCORE_LINE_HEIGHT = 54;
// Keep this in the same order as the shipped jelly fruit frames. Some legacy
// catalog IDs no longer describe the artwork (notably lemon through persimmon),
// so VFX color must follow the visible sprite rather than those old IDs.
const JELLY_SPLASH_PALETTE = Object.freeze([
    [244, 48, 78],   // cherry
    [170, 62, 226],  // grape
    [255, 100, 132], // strawberry
    [255, 151, 43],  // orange
    [255, 218, 45],  // lemon
    [143, 207, 35],  // kiwi
    [255, 137, 149], // peach
    [255, 126, 28],  // persimmon
    [250, 187, 39],  // pineapple
    [158, 211, 82],  // melon
    [53, 181, 82],   // watermelon
] as const);
const CONTINUE_CLEAR_POP_SECONDS = 0.1;
const CONTINUE_CLEAR_SHRINK_SECONDS = 0.24;
const CONTINUE_CLEAR_FADE_DELAY_SECONDS = 0.06;
const CONTINUE_CLEAR_FADE_SECONDS = 0.26;
const CONTINUE_CLEAR_STAGGER_SECONDS = 0.035;
const SENSOR_TILT_SENSITIVITY = 1.08;
const SHAKE_IMPULSE_THRESHOLD = 1;
const SHAKE_WINDOW_MILLISECONDS = 450;
const SHAKE_REQUIRED_IMPULSES = 3;
const SHAKE_SAMPLE_GAP_MILLISECONDS = 220;
const STIR_COOLDOWN_MILLISECONDS = 1_000;
const DEFAULT_INSTRUCTION_TEXT = '左右移动，松手投放，摇晃搅动';

function jellySplashColor(
    level: number,
    alpha: number,
    whiteMix = 0,
): Color {
    const source = JELLY_SPLASH_PALETTE[
        Math.max(0, Math.min(JELLY_SPLASH_PALETTE.length - 1, Math.floor(level)))
    ];
    const mix = Math.max(0, Math.min(1, whiteMix));
    return new Color(
        Math.round(source[0] + (255 - source[0]) * mix),
        Math.round(source[1] + (255 - source[1]) * mix),
        Math.round(source[2] + (255 - source[2]) * mix),
        Math.max(0, Math.min(255, Math.round(alpha))),
    );
}

interface SavedFruit {
    readonly level: number;
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly velocityX: number;
    readonly velocityY: number;
    readonly angularVelocity: number;
    readonly dropSequenceId: number;
    readonly dropMergeCount: number;
    readonly fluidPoints?: readonly SavedFluidPoint[];
}

interface SavedFluidPoint {
    readonly x: number;
    readonly y: number;
    readonly px: number;
    readonly py: number;
}

interface WatermelonActiveRound {
    readonly inProgress: true;
    readonly score: number;
    readonly maxFruitLevel: number;
    readonly currentLevel: number;
    readonly nextLevel: number;
    readonly aimX: number;
    readonly activeDropSequenceId: number;
    readonly fruits: readonly SavedFruit[];
}

export interface WatermelonGameServices {
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly ads?: AdService;
    readonly audio: AudioService;
    readonly platform: Platform;
    readonly deviceTier?: DevicePerformanceTier;
}

export function chooseInitialFruitLevel(
    randomValue: number,
    weights = DEFAULT_WATERMELON_GAMEPLAY_CONFIG.initialSpawnWeights,
): number {
    return chooseWeightedInitialLevel(randomValue, weights);
}

export class DropGate {
    private available = false;

    get canDrop(): boolean {
        return this.available;
    }

    enable(): void {
        this.available = true;
    }

    disable(): void {
        this.available = false;
    }

    tryConsume(): boolean {
        if (!this.available) {
            return false;
        }

        this.available = false;
        return true;
    }
}

@ccclass('WatermelonGame')
export class WatermelonGame extends Component implements MiniGame {
    private state: WatermelonState = 'idle';
    private context?: MiniGameContext<WatermelonGameServices>;
    private fruitContainer?: Node;
    private dropPreview?: Node;
    private spriteFrames: SpriteFrame[] = [];
    private currentLevel = 0;
    private nextLevel = 0;
    private activeDropSequenceId = 0;
    private aimX = 0;
    private readonly dropGate = new DropGate();
    private readonly pointer = new SinglePointerDropController();
    private readonly progress = new WatermelonRoundProgress();
    private overflowGuard = new OverflowGuard();
    private gameplay = DEFAULT_WATERMELON_GAMEPLAY_CONFIG;
    private gameEnding = false;
    private saveData?: GameSaveData;
    private roundStartingHighScore = 0;
    private resultPersisted = false;
    private continueRule = new SingleContinueRule();
    private frozenResult?: WatermelonProgressSnapshot;
    private continueOffered = false;
    private continueCompleted = false;
    private terminalActionPending = false;
    private readonly effectNodes = new Set<Node>();
    private readonly removingFruitNodes = new Set<Node>();
    private audioBank?: BundleAudioBank;
    private overlayView?: WatermelonOverlayView;
    private completedResultModel?: MiniGameResultModel;
    private randomSource: () => number = Math.random;
    private roundSaveElapsed = 0;
    private savedProgressDiscarded = false;
    private operationGeneration = 0;
    private popupFrames?: WatermelonPopupFrames;
    private unsubscribeAccelerometer?: Unsubscribe;
    private rawSensorTilt = 0;
    private sensorTilt = 0;
    private hasPreviousAcceleration = false;
    private previousAccelerationX = 0;
    private previousAccelerationY = 0;
    private previousAccelerationZ = 0;
    private previousAccelerationAt = 0;
    private readonly shakeImpulseTimes: number[] = [];
    private stirCooldownUntil = 0;
    private stirPending = false;
    private fluidAccumulator = 0;
    private roundSaveQuietRemaining = 0;
    private readonly fluidWorld = new WatermelonFluidWorld(
        FRUIT_LEVELS.map((fruit) => fruit.radius),
        {
            left: -WATERMELON_BOARD_WIDTH / 2 + WATERMELON_BOARD_SIDE_PADDING,
            right: WATERMELON_BOARD_WIDTH / 2 - WATERMELON_BOARD_SIDE_PADDING,
            bottom: -WATERMELON_BOARD_HEIGHT / 2 + WATERMELON_BOARD_BOTTOM_PADDING,
            dangerLine: WATERMELON_BOARD_HEIGHT / 2 - 145,
        },
        (event) => this.handleFluidMerge(event),
    );
    private readonly fluidBodies = new Map<Node, WatermelonFluidBody>();
    private readonly fluidNodes = new Map<number, Node>();

    /** 固定种子回归入口；生产默认始终使用平台随机源。 */
    setRandomSourceForTesting(source: () => number): void {
        if (this.state !== 'idle' && this.state !== 'ready') {
            throw new Error('Random source can only change before a round starts.');
        }

        this.randomSource = source;
    }

    async initialize(
        context: MiniGameContext<WatermelonGameServices>,
    ): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`Cannot initialize WatermelonGame from ${this.state}.`);
        }

        const container = this.node.getChildByName('FruitContainer');
        const preview = container?.getChildByName('CurrentFruitPreview');

        if (!container || !preview) {
            throw new Error('FruitContainer or CurrentFruitPreview is missing.');
        }

        this.context = context;
        const layout = this.node.getComponent(WatermelonLayout);
        layout?.setPlatformLayout(context.services.platform.getLayoutInfo());
        await layout?.prepareArtwork();
        this.fruitContainer = container;
        this.dropPreview = preview;
        layout?.setLayoutChangeHandler(this.handleLayoutChange);
        this.gameplay = await this.loadGameplayConfig();
        configureFruitCatalog(this.gameplay);
        this.configureFluidWorld();
        this.overflowGuard = new OverflowGuard(this.gameplay.dangerOverflowSeconds);
        try {
            [this.spriteFrames, this.popupFrames] = await Promise.all([
                this.loadFruitSpriteFrames(),
                loadWatermelonPopupFrames(),
            ]);
            layout?.setFruitRouteFrames(this.spriteFrames);
            this.overlayView = new WatermelonOverlayView(
                this.node,
                context.services.feedback,
                this.popupFrames,
            );
        } catch (error) {
            console.error('[WatermelonGame] Required gameplay assets failed to load.', error);
            this.destroyFruitSpriteFrames();
            destroyWatermelonPopupFrames(this.popupFrames);
            this.popupFrames = undefined;
            throw error;
        }
        this.audioBank = new BundleAudioBank({
            bundle: WATERMELON_RESOURCE_BUNDLE,
            music: 'visual/audio/w1-paper-loop-v1',
            cues: {
                uiButton: 'visual/audio/w1-game-button-v1',
                drop: 'visual/audio/w1-drop-v1',
                collision: [
                    'visual/audio/w1-collision-1-v1',
                    'visual/audio/w1-collision-2-v1',
                    'visual/audio/w1-collision-3-v1',
                ],
                fold: 'visual/audio/w1-fold-v1',
                merge: 'visual/audio/w1-merge-v1',
                chain: 'visual/audio/w1-chain-v1',
                danger: 'visual/audio/w1-danger-v1',
                failure: 'visual/audio/w1-failure-v1',
                continue: 'visual/audio/w1-continue-v1',
                record: 'visual/audio/w1-record-v1',
            },
            optionalCues: {
                milestone: 'visual/audio/w1-milestone-v1',
            },
        }, context.services.audio, context.services.feedback);
        void this.audioBank.initialize().catch((error: unknown) => {
            console.error('[WatermelonGame] Audio initialization failed.', error);
        });
        container.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        if (context.services.platform.supportsAccelerometer()) {
            this.unsubscribeAccelerometer = context.services.platform.onAccelerometerChange(this.handleAccelerometer);
            context.services.platform.startAccelerometer();
        }
        container.on(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        container.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        container.on(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        // Node touch events may stop being dispatched after the finger leaves
        // the board. Keep the terminal events on the global input dispatcher
        // so releasing outside the board still commits the current drop.
        input.on(Input.EventType.TOUCH_END, this.handleTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.node.getChildByName('PauseButton')?.on(
            Button.EventType.CLICK,
            this.handlePause,
            this,
        );
        this.configureContainerBounds();
        this.state = 'ready';
    }

    protected update(deltaTime: number): void {
        if (this.state !== 'playing' || this.gameEnding) {
            return;
        }

        const frameDelta = Math.min(Math.max(0, deltaTime), 0.065);
        const tiltAlpha = 1 - Math.exp(-frameDelta / 0.09);
        this.sensorTilt += (this.rawSensorTilt - this.sensorTilt) * tiltAlpha;
        this.fluidWorld.tilt = this.sensorTilt;
        if (this.stirPending) {
            // Accelerometer callbacks are not synchronized with the Cocos
            // frame. Coalesce them and mutate the solver only at its frame
            // boundary instead of doing unscheduled work between frames.
            this.stirPending = false;
            this.fluidWorld.stir(this.randomSource);
            this.roundSaveQuietRemaining = Math.max(
                this.roundSaveQuietRemaining,
                STIR_SAVE_QUIET_SECONDS,
            );
            this.context?.services.feedback.vibrate('heavy');
        }
        this.fluidAccumulator += frameDelta;
        let fluidSteps = 0;
        while (this.fluidAccumulator >= FLUID_FIXED_STEP_SECONDS
            && fluidSteps < MAX_FLUID_STEPS_PER_FRAME) {
            this.fluidWorld.step(FLUID_FIXED_STEP_SECONDS);
            this.fluidAccumulator -= FLUID_FIXED_STEP_SECONDS;
            fluidSteps += 1;
        }
        if (this.fluidAccumulator >= FLUID_FIXED_STEP_SECONDS) {
            // Drop stale backlog after a long frame. Catching it up in full
            // makes an overloaded phone do progressively more work each frame
            // and traps the game in a low-FPS spiral.
            this.fluidAccumulator %= FLUID_FIXED_STEP_SECONDS;
        }
        this.fluidBodies.forEach((fluid, node) => {
            if (!node.isValid || !this.fluidWorld.has(fluid)) {
                this.unbindFluidBody(node, fluid);
                return;
            }
            node.setPosition(fluid.x, fluid.y);
            const fruit = node.getComponent(FruitBody);
            fruit?.applyFluidShape(fluid.points, fluid.x, fluid.y);
        });

        let dangerSeconds = 0;
        for (const body of this.fluidWorld.bodies) {
            dangerSeconds = Math.max(dangerSeconds, body.dangerSeconds);
        }
        const wasTiming = this.overflowGuard.isTiming;
        const finished = this.overflowGuard.synchronize(dangerSeconds);

        if (dangerSeconds > 0 && !wasTiming && this.overflowGuard.isTiming) {
            this.context?.services.feedback.play('danger');
        }

        this.updateDangerFeedback();

        const elapsed = Math.max(0, deltaTime);
        this.roundSaveElapsed += elapsed;
        this.roundSaveQuietRemaining = Math.max(0, this.roundSaveQuietRemaining - elapsed);
        if (this.roundSaveElapsed >= ROUND_SAVE_INTERVAL_SECONDS
            && this.roundSaveQuietRemaining <= 0) {
            // Snapshot construction serializes all 18 points of every fruit
            // and StorageService serializes the complete user-data root.
            // Commit and flush together during a quiet frame; otherwise the
            // deferred setItem timer can wake up in the middle of the next drop.
            this.persistRoundProgress(true, true);
        }

        if (finished) {
            this.finishForOverflow();
        }
    }

    begin(): void {
        if (this.state !== 'ready') {
            throw new Error(`Cannot begin WatermelonGame from ${this.state}.`);
        }

        this.operationGeneration += 1;
        this.state = 'playing';
        this.saveData = normalizeWatermelonSave(
            this.context?.services.storage.getGameData('watermelon'),
        );
        this.roundStartingHighScore = this.saveData.highScore ?? 0;
        if (!this.restoreSavedRound()) {
            this.resetRound();
            this.recordPlayStart();
        }
    }

    pause(): boolean {
        if (this.state !== 'playing') {
            throw new Error(`Cannot pause WatermelonGame from ${this.state}.`);
        }

        this.state = 'paused';
        if (!this.gameEnding) this.persistRoundProgress(true);
        this.pointer.reset();
        this.cleanupTransientEffects();
        this.context?.services.audio.pauseMusic();
        return true;
    }

    resume(): void {
        if (this.state !== 'paused') {
            throw new Error(`Cannot resume WatermelonGame from ${this.state}.`);
        }

        this.state = 'playing';
        this.context?.services.audio.resumeMusic();
    }

    async restart(context?: MiniGameContext<WatermelonGameServices>): Promise<void> {
        if (this.state !== 'playing' && this.state !== 'paused') {
            throw new Error(`Cannot restart WatermelonGame from ${this.state}.`);
        }

        if (context) this.context = context;
        this.operationGeneration += 1;
        this.cacheHighScore(this.progress.snapshot.score);
        this.destroyContinueOverlay();
        this.state = 'playing';
        this.context?.services.audio.resumeMusic();
        this.resetRound();
        this.recordPlayStart();
    }

    discardSavedProgress(): void {
        this.savedProgressDiscarded = true;
        this.persistRoundProgress(false);
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.overlayView?.showPause(model, this.progress.snapshot.score);
    }

    hidePauseMenu(): void {
        this.overlayView?.hidePause();
    }

    showResultView(model: MiniGameResultModel): void {
        this.completedResultModel = model;
        // 结算态复用暂停按钮的图标，点击仍由 handlePause 打开结算弹窗。
        this.setPauseButtonLabel('暂停');
        this.overlayView?.showResult(model, this.dismissResultOverlay);
    }

    hideResultView(): void {
        this.overlayView?.hideResult();
        this.completedResultModel = undefined;
        this.setPauseButtonLabel('暂停');
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') {
            return;
        }

        this.operationGeneration += 1;
        if (!this.gameEnding && !this.savedProgressDiscarded) {
            this.persistRoundProgress(true);
        }
        this.unscheduleAllCallbacks();
        this.unsubscribeAccelerometer?.();
        this.unsubscribeAccelerometer = undefined;
        this.context?.services.platform.stopAccelerometer();
        this.rawSensorTilt = 0;
        this.sensorTilt = 0;
        this.resetShakeTracking();
        this.stirCooldownUntil = 0;
        this.fruitContainer?.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        input.off(Input.EventType.TOUCH_END, this.handleTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.node.getChildByName('PauseButton')?.off(
            Button.EventType.CLICK,
            this.handlePause,
            this,
        );
        const layout = this.node.getComponent(WatermelonLayout);
        layout?.setLayoutChangeHandler();
        this.clearFruitSpriteBindings();
        this.clearFruits();
        this.fluidWorld.reset();
        this.fluidBodies.clear();
        this.fluidNodes.clear();
        this.cleanupTransientEffects();
        this.destroyContinueOverlay();
        this.overlayView?.dispose();
        this.overlayView = undefined;
        destroyWatermelonPopupFrames(this.popupFrames);
        this.popupFrames = undefined;
        this.completedResultModel = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.dropGate.disable();
        this.pointer.reset();
        await this.releaseFruitSpriteFramesAfterDraw();
        this.context = undefined;
        this.saveData = undefined;
        this.fruitContainer = undefined;
        this.dropPreview = undefined;
        this.state = 'disposed';
        this.gameEnding = true;
    }

    private readonly handleAccelerometer = (sample: { x: number; y: number; z: number }): void => {
        const raw = Math.max(-1, Math.min(1, sample.x * SENSOR_TILT_SENSITIVITY));
        const deadZone = 0.04;
        this.rawSensorTilt = Math.abs(raw) <= deadZone
            ? 0
            : Math.sign(raw) * Math.min(1, (Math.abs(raw) - deadZone) / (1 - deadZone));
        this.trackShake(sample, Date.now());
    };

    private trackShake(
        sample: { x: number; y: number; z: number },
        sampledAt: number,
    ): void {
        const hadPrevious = this.hasPreviousAcceleration;
        const previousX = this.previousAccelerationX;
        const previousY = this.previousAccelerationY;
        const previousZ = this.previousAccelerationZ;
        const previousAt = this.previousAccelerationAt;
        this.hasPreviousAcceleration = true;
        this.previousAccelerationX = sample.x;
        this.previousAccelerationY = sample.y;
        this.previousAccelerationZ = sample.z;
        this.previousAccelerationAt = sampledAt;
        if (this.state !== 'playing' || this.gameEnding || !hadPrevious) {
            this.shakeImpulseTimes.length = 0;
            return;
        }

        const sampleGap = sampledAt - previousAt;
        if (sampleGap <= 0 || sampleGap > SHAKE_SAMPLE_GAP_MILLISECONDS) {
            this.shakeImpulseTimes.length = 0;
            return;
        }

        const deltaX = sample.x - previousX;
        const deltaY = sample.y - previousY;
        const deltaZ = sample.z - previousZ;
        const impulseSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
        const windowStart = sampledAt - SHAKE_WINDOW_MILLISECONDS;
        while (this.shakeImpulseTimes.length > 0
            && this.shakeImpulseTimes[0] < windowStart) {
            this.shakeImpulseTimes.shift();
        }
        if (impulseSquared < SHAKE_IMPULSE_THRESHOLD * SHAKE_IMPULSE_THRESHOLD) return;

        this.shakeImpulseTimes.push(sampledAt);
        if (this.shakeImpulseTimes.length < SHAKE_REQUIRED_IMPULSES) return;

        this.shakeImpulseTimes.length = 0;
        if (sampledAt < this.stirCooldownUntil) {
            return;
        }

        this.stirCooldownUntil = sampledAt + STIR_COOLDOWN_MILLISECONDS;
        this.stirPending = true;
    }

    private resetShakeTracking(): void {
        this.hasPreviousAcceleration = false;
        this.previousAccelerationX = 0;
        this.previousAccelerationY = 0;
        this.previousAccelerationZ = 0;
        this.previousAccelerationAt = 0;
        this.shakeImpulseTimes.length = 0;
        this.stirPending = false;
    }

    private handleFluidMerge(event: WatermelonFluidMergeEvent): void {
        this.roundSaveQuietRemaining = Math.max(
            this.roundSaveQuietRemaining,
            MERGE_SAVE_QUIET_SECONDS,
        );
        const firstNode = this.fluidNodes.get(event.first.id);
        const secondNode = this.fluidNodes.get(event.second.id);
        const first = firstNode?.getComponent(FruitBody);
        const second = secondNode?.getComponent(FruitBody);
        if (this.state !== 'playing' || this.gameEnding || !firstNode || !secondNode || !first || !second) {
            if (event.result) this.fluidWorld.remove(event.result);
            return;
        }

        const dropSequenceId = this.activeDropSequenceId;
        const firstContinuesDrop = dropSequenceId > 0 && first.sourceDropSequenceId === dropSequenceId;
        const secondContinuesDrop = dropSequenceId > 0 && second.sourceDropSequenceId === dropSequenceId;
        const continuesCurrentDrop = firstContinuesDrop || secondContinuesDrop;
        const dropMergeCount = continuesCurrentDrop
            ? Math.max(
                firstContinuesDrop ? first.sourceDropMergeCount : 0,
                secondContinuesDrop ? second.sourceDropMergeCount : 0,
            ) + 1
            : 1;
        const resultDropSequenceId = continuesCurrentDrop ? dropSequenceId : 0;

        this.unbindFluidBody(firstNode, event.first);
        this.unbindFluidBody(secondNode, event.second);
        firstNode.destroy();
        secondNode.destroy();

        const resultBody = event.result
            ? this.spawnFruit(
                event.level,
                event.result.x,
                event.result.y,
                resultDropSequenceId,
                dropMergeCount,
                event.result,
            )
            : undefined;
        const scoreEvent = this.progress.recordMerge(event.level, dropMergeCount);
        this.spawnMergeFeedback(scoreEvent, event.x, event.y);
        this.updateProgress();
        this.context?.services.feedback.play('fold');
        this.context?.services.feedback.play('merge');
        if (scoreEvent.isChain) this.context?.services.feedback.play('chain');
        if (scoreEvent.isMilestone) this.context?.services.feedback.play('milestone');
    }

    private loadFruitSpriteFrames(): Promise<SpriteFrame[]> {
        const bundle = assetManager.getBundle(WATERMELON_RESOURCE_BUNDLE);

        if (!bundle) {
            return Promise.reject(new Error(`${WATERMELON_RESOURCE_BUNDLE} bundle is unavailable.`));
        }

        const entries: Array<{
            readonly key: string;
            readonly frameName: string;
            readonly fallbackTexturePath: string;
        }> = [];
        FRUIT_LEVELS.forEach((config, level) => {
            entries.push({
                key: `${level}`,
                frameName: autoAtlasFrameName(config.sprite),
                fallbackTexturePath: config.sprite,
            });
        });
        return loadAutoAtlasFrames(bundle, WATERMELON_CAT_ATLAS_PATH, entries)
            .then((frames) => FRUIT_LEVELS.map((_, level) => {
                const frame = frames[`${level}`];
                if (!frame) {
                    throw new Error(`Cat daily sprite frame missing: ${level}`);
                }
                return frame;
            }));
    }

    private destroyFruitSpriteFrames(frames = this.spriteFrames): void {
        for (const spriteFrame of frames) {
            if (spriteFrame.isValid) {
                spriteFrame.destroy();
            }
        }
        if (frames === this.spriteFrames) {
            this.spriteFrames = [];
        }
    }

    private clearFruitSpriteBindings(): void {
        const owned = new Set<SpriteFrame>();
        for (const spriteFrame of this.spriteFrames) {
            owned.add(spriteFrame);
        }
        for (const sprite of this.node.getComponentsInChildren(Sprite)) {
            if (sprite.spriteFrame && owned.has(sprite.spriteFrame)) {
                sprite.spriteFrame = null;
            }
        }
    }

    private async releaseFruitSpriteFramesAfterDraw(): Promise<void> {
        const frames = this.spriteFrames;
        this.spriteFrames = [];
        if (frames.length === 0) {
            return;
        }

        await new Promise<void>((resolve) => {
            director.once(Director.EVENT_AFTER_DRAW, () => {
                this.destroyFruitSpriteFrames(frames);
                resolve();
            });
        });
    }

    private loadGameplayConfig(): Promise<WatermelonGameplayConfig> {
        const bundle = assetManager.getBundle('game-watermelon');

        if (!bundle) {
            return Promise.reject(new Error('game-watermelon bundle is unavailable.'));
        }

        return new Promise((resolve, reject) => {
            bundle.load('configs/gameplay', JsonAsset, (error, asset) => {
                if (error || !asset) {
                    reject(error ?? new Error('Watermelon gameplay config is missing.'));
                    return;
                }

                try {
                    resolve(requireWatermelonGameplayConfig(asset.json));
                } catch (configError) {
                    reject(configError);
                }
            });
        });
    }

    private resetRound(): void {
        this.unscheduleAllCallbacks();
        this.cleanupTransientEffects();
        this.clearFruits();
        this.rawSensorTilt = 0;
        this.sensorTilt = 0;
        this.resetShakeTracking();
        this.node.getComponent(WatermelonLayout)
            ?.setInstructionPresentation(DEFAULT_INSTRUCTION_TEXT);
        this.fluidAccumulator = 0;
        this.aimX = 0;
        this.activeDropSequenceId = 0;
        this.currentLevel = chooseInitialFruitLevel(
            this.randomSource(),
            this.gameplay.initialSpawnWeights,
        );
        this.nextLevel = chooseInitialFruitLevel(
            this.randomSource(),
            this.gameplay.initialSpawnWeights,
        );
        this.dropGate.enable();
        this.pointer.reset();
        this.progress.reset();
        this.overflowGuard.reset();
        this.updateDangerFeedback();
        this.gameEnding = false;
        this.resultPersisted = false;
        this.continueRule = new SingleContinueRule();
        this.frozenResult = undefined;
        this.continueOffered = false;
        this.continueCompleted = false;
        this.terminalActionPending = false;
        this.roundSaveElapsed = 0;
        this.roundSaveQuietRemaining = 0;
        this.savedProgressDiscarded = false;
        this.destroyContinueOverlay();
        this.updateProgress();
        this.updatePreviews();
    }

    private clearFruits(): void {
        const container = this.fruitContainer;

        if (container) {
            for (const child of [...container.children]) {
                if (child.getComponent(FruitBody)) {
                    this.effectNodes.delete(child);
                    this.removingFruitNodes.delete(child);
                    child.removeFromParent();
                    child.destroy();
                }
            }
        }
        this.fluidWorld.reset();
        this.fluidBodies.clear();
        this.fluidNodes.clear();
        this.fluidAccumulator = 0;
    }

    private configureContainerBounds(): void {
        const container = this.fruitContainer;
        const size = container?.getComponent(UITransform)?.contentSize;

        if (!container || !size) {
            return;
        }

        const wallThickness = WATERMELON_BOARD_WALL_THICKNESS;
        const horizontalPadding = WATERMELON_BOARD_SIDE_PADDING;
        const leftBoundary = -size.width / 2 + horizontalPadding;
        const rightBoundary = size.width / 2 - horizontalPadding;
        const bottomBoundary = -size.height / 2 + WATERMELON_BOARD_BOTTOM_PADDING;
        this.configureFluidWorld();

        this.configureWall(
            container.getChildByName('LeftWall'),
            leftBoundary - wallThickness / 2,
            0,
            wallThickness,
            size.height,
        );
        this.configureWall(
            container.getChildByName('RightWall'),
            rightBoundary + wallThickness / 2,
            0,
            wallThickness,
            size.height,
        );
        this.configureWall(
            container.getChildByName('BottomWall'),
            0,
            bottomBoundary - wallThickness / 2,
            size.width + wallThickness * 2,
            wallThickness,
        );
    }

    private configureFluidWorld(): void {
        const container = this.fruitContainer;
        const size = container?.getComponent(UITransform)?.contentSize;
        const dangerLine = container?.getChildByName('DangerLine')?.position.y;
        if (!size || dangerLine === undefined) return;
        this.fluidWorld.configure(
            FRUIT_LEVELS.map((_, level) => getFruitConfig(level).radius),
            {
                left: -size.width / 2 + WATERMELON_BOARD_SIDE_PADDING,
                right: size.width / 2 - WATERMELON_BOARD_SIDE_PADDING,
                bottom: -size.height / 2 + WATERMELON_BOARD_BOTTOM_PADDING,
                dangerLine,
            },
        );
    }

    private readonly handleLayoutChange = (): void => {
        if (!this.fruitContainer) {
            return;
        }

        this.configureContainerBounds();
        if (this.state === 'ready' || this.state === 'playing') {
            this.positionDropPreview();
            return;
        }
        this.setAimGuideVisible(false);
    };

    private configureWall(
        wall: Node | null,
        x: number,
        y: number,
        width: number,
        height: number,
    ): void {
        if (!wall) {
            return;
        }

        wall.setPosition(x, y);
        wall.getComponent(UITransform)?.setContentSize(width, height);
        const body = wall.getComponent(RigidBody2D);
        const collider = wall.getComponent(BoxCollider2D);
        // The point solver owns these same bounds. Keeping the serialized
        // Box2D walls enabled made Cocos step a second, empty physics world
        // throughout the round and served no collision consumer.
        if (collider) collider.enabled = false;
        if (body) body.enabled = false;
    }

    private readonly handleTouchStart = (event: EventTouch): void => {
        if (this.pointer.start(event.getID(), this.canAcceptDropInput())) {
            this.updateAim(event);
        }
    };

    private readonly handleTouchMove = (event: EventTouch): void => {
        if (this.pointer.owns(event.getID())) {
            this.updateAim(event);
        }
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        if (!this.pointer.owns(event.getID())) {
            return;
        }

        this.updateAim(event);
        if (this.pointer.finish(event.getID())) {
            this.dropCurrentFruit();
        }
    };

    private readonly handleTouchCancel = (event: EventTouch): void => {
        this.pointer.cancel(event.getID());
    };

    private canAcceptDropInput(): boolean {
        return this.state === 'playing'
            && this.dropGate.canDrop
            && !!this.fruitContainer;
    }

    private updateAim(event: EventTouch): void {
        if (this.state !== 'playing'
            || !this.dropGate.canDrop
            || !this.fruitContainer) {
            return;
        }

        const location = event.getUILocation();
        const local = this.fruitContainer.getComponent(UITransform)
            ?.convertToNodeSpaceAR(new Vec3(location.x, location.y));
        const boardWidth = this.fruitContainer.getComponent(UITransform)
            ?.contentSize.width ?? WATERMELON_BOARD_WIDTH;

        if (local) {
            this.aimX = clampDropX(
                local.x,
                boardWidth,
                getFruitConfig(this.currentLevel).radius,
                WATERMELON_BOARD_SIDE_PADDING + this.gameplay.dropEdgePadding,
            );
            this.positionDropPreview();
        }
    }

    private dropCurrentFruit(): void {
        if (this.state !== 'playing'
            || !this.dropGate.tryConsume()
            || !this.fruitContainer) {
            return;
        }

        const generation = this.operationGeneration;
        const config = getFruitConfig(this.currentLevel);
        const boardHeight = this.fruitContainer.getComponent(UITransform)
            ?.contentSize.height ?? WATERMELON_BOARD_HEIGHT;
        const droppedLevel = this.currentLevel;
        this.activeDropSequenceId += 1;
        const dropped = this.spawnFruit(
            this.currentLevel,
            this.aimX,
            boardHeight / 2
                - WATERMELON_BOARD_INNER_PADDING
                - config.radius
                - CAT_DROP_TOP_GAP,
            this.activeDropSequenceId,
        );
        this.roundSaveQuietRemaining = Math.max(
            this.roundSaveQuietRemaining,
            DROP_SAVE_QUIET_SECONDS,
        );
        this.progress.recordSpawn(droppedLevel);
        this.updateProgress();
        this.context?.services.feedback.play('drop');
        if (this.dropPreview) {
            this.dropPreview.active = false;
        }
        this.setAimGuideVisible(false);

        this.currentLevel = this.nextLevel;
        this.nextLevel = chooseInitialFruitLevel(
            this.randomSource(),
            this.gameplay.initialSpawnWeights,
        );
        this.updateNextPreview();
        this.scheduleOnce(
            () => this.finishDropCooldown(generation),
            this.gameplay.dropCooldownSeconds,
        );
    }

    private finishDropCooldown(generation: number): void {
        if (!this.isGenerationCurrent(generation) || this.gameEnding) {
            return;
        }

        // 暂停期间调度器仍可能触发回调；保留冷却完成动作，等继续游戏后
        // 再恢复投放闸门和顶部可下落水果，避免预览永久停留在隐藏状态。
        if (this.state !== 'playing') {
            this.scheduleOnce(() => this.finishDropCooldown(generation), 0.05);
            return;
        }

        this.dropGate.enable();
        this.positionDropPreview();
        if (this.dropPreview) {
            this.dropPreview.active = true;
        }
        this.updateAimGuide();
    }

    private readonly handlePause = (): void => {
        if (this.state === 'paused' && this.completedResultModel) {
            this.context?.services.feedback.play('uiButton');
            this.overlayView?.showResult(this.completedResultModel, this.dismissResultOverlay);
            return;
        }
        if (this.state === 'playing') {
            this.context?.services.feedback.play('uiButton');
            this.context?.requestPause();
        }
    };

    private readonly dismissResultOverlay = (): void => {
        this.overlayView?.hideResult();
        this.setPauseButtonLabel('暂停');
    };

    private setPauseButtonLabel(text: string): void {
        const label = this.node.getChildByName('PauseButton')
            ?.getChildByName('Label')
            ?.getComponent(Label);
        if (label) {
            label.string = text;
        }
        const pauseArtwork = this.node.getChildByName('PauseButton')
            ?.getChildByName('PauseArtwork');
        if (pauseArtwork) {
            pauseArtwork.active = text === '暂停';
        }
    }

    private finishForOverflow(): void {
        if (this.gameEnding || !this.context) {
            return;
        }

        this.gameEnding = true;
        this.dropGate.disable();
        this.pointer.reset();
        this.unscheduleAllCallbacks();
        this.freezeRoundPhysics();
        if (this.dropPreview) {
            this.dropPreview.active = false;
        }
        this.setAimGuideVisible(false);
        this.updateDangerFeedback(true);
        const snapshot = this.progress.snapshot;
        this.frozenResult = snapshot;
        this.persistRoundProgress(false);
        this.context.services.feedback.play('failure');
        this.context.services.audio.pauseMusic();

        const ads = this.context.services.ads;
        if (this.continueRule.canOffer
            && (!ads || ads.isEnabledForGame(this.context.gameId))) {
            this.showContinueOverlay();
        } else {
            this.finalizeFrozenRound('overflow');
        }
    }

    private persistCompletedResult(snapshot: WatermelonProgressSnapshot): void {
        if (this.resultPersisted || !this.context || !this.saveData) {
            return;
        }

        this.resultPersisted = true;
        const refreshed = refreshCompletedWatermelonSave(this.saveData, snapshot, {
            continueOffered: this.continueOffered,
            continueCompleted: this.continueCompleted,
        });

        try {
            this.context.services.storage.writeGameData('watermelon', refreshed);
            this.saveData = refreshed;
        } catch (error: unknown) {
            console.error('[WatermelonGame] Final save failed.', error);
        }
    }

    private cacheHighScore(score: number): void {
        if (!this.saveData) return;
        const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
        if (safeScore <= (this.saveData.highScore ?? 0)) return;
        this.saveData = Object.freeze({ ...this.saveData, highScore: safeScore });
    }

    private freezeRoundPhysics(): void {
        this.cleanupTransientEffects();
        for (const child of this.fruitContainer?.children ?? []) {
            if (child.getComponent(FruitBody)) {
                const rigidBody = child.getComponent(RigidBody2D);
                if (rigidBody) {
                    rigidBody.enabled = false;
                }
            }
        }
    }

    private resumeRoundPhysics(): void {
        for (const child of this.fruitContainer?.children ?? []) {
            const fruit = child.getComponent(FruitBody);
            if (!fruit) {
                continue;
            }

            // Cats that are playing the continue-clear animation stay out of
            // the physics world until the animation destroys them.
            if (this.removingFruitNodes.has(child)) {
                continue;
            }

            fruit.unlockAfterCancelledMerge();
            const rigidBody = child.getComponent(RigidBody2D);
            if (rigidBody) {
                rigidBody.enabled = true;
            }
        }
    }

    private removeDangerFruits(): number {
        const container = this.fruitContainer;
        const dangerY = container?.getChildByName('DangerLine')?.position.y;

        if (!container || dangerY === undefined) {
            return 0;
        }

        const fruits = container.children
            .map((node) => ({ node, body: node.getComponent(FruitBody) }))
            .filter((item): item is { node: Node; body: FruitBody } => !!item.body);
        let targets = fruits.filter((item) => (
            item.node.position.y + getFruitConfig(item.body.level).radius > dangerY
        ));

        if (targets.length === 0 && fruits.length > 0) {
            targets = [fruits.reduce((highest, item) => (
                item.node.position.y > highest.node.position.y ? item : highest
            ))];
        }

        targets.forEach((item, index) => {
            this.playContinueClearAnimation(item.node, item.body, index);
        });
        return targets.length;
    }

    private playContinueClearAnimation(
        node: Node,
        fruit: FruitBody,
        index: number,
    ): void {
        if (!node.isValid || !fruit.lockForMerge()) {
            return;
        }

        const fluid = this.fluidBodies.get(node);
        if (fluid) this.fluidWorld.remove(fluid);
        this.unbindFluidBody(node, fluid);

        this.removingFruitNodes.add(node);
        this.effectNodes.add(node);

        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        const startScale = node.scale;
        const startAngle = node.angle;
        const startOpacity = opacity.opacity;
        const delay = index * CONTINUE_CLEAR_STAGGER_SECONDS;
        const popScale = new Vec3(
            startScale.x * 1.08,
            startScale.y * 1.08,
            startScale.z,
        );
        const endScale = new Vec3(
            startScale.x * 0.08,
            startScale.y * 0.08,
            startScale.z,
        );

        // Keep the actual cat visible for the first beat, then let it fold
        // into a soft point instead of vanishing on the same frame.
        tween(node)
            .delay(delay)
            .to(CONTINUE_CLEAR_POP_SECONDS, {
                scale: popScale,
                angle: startAngle + (index % 2 === 0 ? 9 : -9),
            }, { easing: 'quadOut' })
            .to(CONTINUE_CLEAR_SHRINK_SECONDS, {
                scale: endScale,
                angle: startAngle + (index % 2 === 0 ? 18 : -18),
            }, { easing: 'backIn' })
            .call(() => this.releaseEffectNode(node))
            .start();

        tween(opacity)
            .delay(delay + CONTINUE_CLEAR_FADE_DELAY_SECONDS)
            .to(CONTINUE_CLEAR_FADE_SECONDS, { opacity: 0 }, { easing: 'quadIn' })
            .start();

        if (this.context?.services.deviceTier !== 'low') {
            this.spawnContinueClearRing(node, index, delay, startOpacity);
        }
    }

    private spawnContinueClearRing(
        source: Node,
        index: number,
        delay: number,
        sourceOpacity: number,
    ): void {
        const container = this.fruitContainer;
        if (!container || !source.isValid) {
            return;
        }

        const ring = new Node('ContinueClearRingFx');
        ring.layer = container.layer;
        ring.setParent(container);
        ring.setPosition(source.position);
        ring.addComponent(UITransform).setContentSize(28, 28);
        const opacity = ring.addComponent(UIOpacity);
        opacity.opacity = Math.min(255, Math.max(0, sourceOpacity));
        const graphics = ring.addComponent(Graphics);
        graphics.strokeColor = catUiColor('butter', 230);
        graphics.lineWidth = 4;
        graphics.circle(0, 0, 10);
        graphics.stroke();
        ring.setScale(0.45, 0.45, 1);
        this.effectNodes.add(ring);

        tween(ring)
            .delay(delay)
            .to(0.16, {
                scale: new Vec3(1.45, 1.45, 1),
                angle: index % 2 === 0 ? 8 : -8,
            }, { easing: 'quadOut' })
            .to(0.18, {
                scale: new Vec3(2.2, 2.2, 1),
            }, { easing: 'quadIn' })
            .call(() => this.releaseEffectNode(ring))
            .start();
        tween(opacity)
            .delay(delay + 0.04)
            .to(0.3, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    private async requestContinue(): Promise<void> {
        const generation = this.operationGeneration;
        const context = this.context;
        const ads = context?.services.ads;

        if (!context) {
            return;
        }
        if (ads && !ads.isEnabledForGame(context.gameId)) {
            this.finalizeFrozenRound('ads_disabled');
            return;
        }
        if (!this.continueRule.beginRequest()) return;

        try {
            const result = ads
                ? await ads.showRewarded({
                    placement: AD_PLACEMENTS.watermelonRevive,
                    gameId: context.gameId,
                    sessionId: context.sessionId,
                })
                : { outcome: 'completed' as const };
            if (!this.isGenerationCurrent(generation)) return;
            const resolution = this.continueRule.resolve(result.outcome);

            if (resolution === 'continue') {
                this.resumeAfterContinue();
            } else if (resolution === 'settle') {
                this.finalizeFrozenRound(`ad_${result.outcome}`);
            }
        } catch (_error: unknown) {
            if (!this.isGenerationCurrent(generation)) return;
            const resolution = this.continueRule.resolve('failed');
            if (resolution === 'settle') {
                this.finalizeFrozenRound('ad_failed');
            }
        }
    }

    private declineContinue(): void {
        if (this.continueRule.decline()) {
            this.finalizeFrozenRound('continue_declined');
        }
    }

    private restartFromFailure(): void {
        if (this.terminalActionPending) return;
        this.terminalActionPending = true;
        this.continueRule.decline();
        const result = this.completeFrozenRound('failure_restart');
        this.context?.requestRestart(result);
    }

    private returnToLobbyFromFailure(): void {
        if (this.terminalActionPending) return;
        this.terminalActionPending = true;
        this.continueRule.decline();
        const result = this.completeFrozenRound('failure_lobby');
        this.context?.requestLobby(result);
    }

    private resumeAfterContinue(): void {
        this.continueCompleted = true;
        this.removeDangerFruits();
        this.destroyContinueOverlay();
        this.overflowGuard.reset();
        this.frozenResult = undefined;
        this.gameEnding = false;
        this.resumeRoundPhysics();
        this.updateDangerFeedback();
        this.context?.services.feedback.play('continue');
        this.context?.services.audio.resumeMusic();
        this.persistRoundProgress(true);
        const generation = this.operationGeneration;
        this.scheduleOnce(() => {
            if (this.isGenerationCurrent(generation)
                && this.state === 'playing'
                && !this.gameEnding) {
                this.dropGate.enable();
                this.positionDropPreview();
                if (this.dropPreview) {
                    this.dropPreview.active = true;
                }
                this.updateAimGuide();
            }
        }, this.gameplay.continueSettleSeconds);
    }

    private finalizeFrozenRound(reason: string): void {
        if (this.terminalActionPending) return;
        this.terminalActionPending = true;
        this.destroyContinueOverlay();
        this.context?.requestExit(this.completeFrozenRound(reason));
    }

    private completeFrozenRound(reason: string): GameResult {
        const snapshot = this.frozenResult ?? this.progress.snapshot;
        const isNewRecord = snapshot.score > this.roundStartingHighScore;
        this.persistCompletedResult(snapshot);
        if (isNewRecord) this.context?.services.feedback.play('record');
        return Object.freeze({
            score: snapshot.score,
            duration: 0,
            completed: true,
            extra: Object.freeze({
                reason,
                maxFruitLevel: snapshot.maxFruitLevel,
                continued: this.continueRule.state === 'used',
                newRecord: isNewRecord,
            }),
        });
    }

    private showContinueOverlay(): void {
        this.destroyContinueOverlay();
        this.continueOffered = true;
        this.overlayView?.showContinue({
            continueGame: () => this.requestContinue(),
            settle: () => this.declineContinue(),
            restart: () => this.restartFromFailure(),
            returnToLobby: () => this.returnToLobbyFromFailure(),
        });
    }

    private destroyContinueOverlay(): void {
        this.overlayView?.hideContinue();
    }

    private updateDangerFeedback(failed = false): void {
        const label = this.fruitContainer?.getChildByName('DangerLine')
            ?.getComponent(Label);

        if (!label) {
            return;
        }

        if (failed) {
            label.string = '⚠ 已越过警戒线';
            label.color = catUiColor('danger');
        } else if (this.overflowGuard.isTiming) {
            label.string = `⚠ 危险 ${this.overflowGuard.remainingSeconds.toFixed(1)}s`;
            label.color = catUiColor('peachDark');
        } else {
            label.string = '· · · · · ·  水果警戒线  · · · · · · ';
            label.color = catUiColor('peachDark', 205);
        }
        label.enabled = true;
    }

    private spawnMergeFeedback(
        event: WatermelonMergeScoreEvent,
        x: number,
        y: number,
    ): void {
        const container = this.fruitContainer;
        if (!container) return;

        this.spawnJellyMergeSplash(event.resultLevel, x, y);

        const scoreNode = new Node('MergeScoreFx');
        scoreNode.layer = container.layer;
        scoreNode.setParent(container);
        scoreNode.setPosition(x, y + 28);
        const scoreWidth = event.isChain ? 292 : 190;
        const scoreHeight = event.isChain ? 78 : 60;
        scoreNode.addComponent(UITransform).setContentSize(scoreWidth, scoreHeight);
        const opacity = scoreNode.addComponent(UIOpacity);
        const labelNode = new Node('ScoreLabel');
        labelNode.layer = container.layer;
        labelNode.setParent(scoreNode);
        labelNode.addComponent(UITransform).setContentSize(scoreWidth - 20, scoreHeight - 8);
        const label = labelNode.addComponent(Label);
        label.string = event.isChain ? `连锁×${event.chainDepth}  +${event.points}` : `+${event.points}`;
        label.fontSize = event.isChain
            ? MERGE_CHAIN_SCORE_FONT_SIZE
            : MERGE_SCORE_FONT_SIZE;
        label.lineHeight = event.isChain
            ? MERGE_CHAIN_SCORE_LINE_HEIGHT
            : MERGE_SCORE_LINE_HEIGHT;
        label.isBold = true;
        label.color = catUiColor('mergeInk');
        label.enableShadow = false;
        label.enableOutline = true;
        label.outlineColor = Color.WHITE;
        label.outlineWidth = event.isChain ? 4 : 3;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        this.effectNodes.add(scoreNode);
        const duration = event.isChain ? 0.78 : 0.46;
        if (event.isChain) {
            scoreNode.setScale(0.72, 0.72, 1);
            tween(scoreNode)
                .to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'backOut' })
                .to(0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
                .to(duration - 0.3, { position: new Vec3(x, y + 122, 0) }, { easing: 'quadOut' })
                .call(() => this.releaseEffectNode(scoreNode))
                .start();
        } else {
            tween(scoreNode)
                .to(duration, { position: new Vec3(x, y + 104, 0) }, { easing: 'quadOut' })
                .call(() => this.releaseEffectNode(scoreNode))
                .start();
        }
        tween(opacity).delay(event.isChain ? 0.34 : 0).to(duration - (event.isChain ? 0.34 : 0), { opacity: 0 }).start();

    }

    /**
     * Throws glossy tear-shaped drops from around the resulting fruit. Every
     * measurement is derived from that fruit's radius, so larger merges create
     * wider, heavier splashes without covering the fruit with a center ripple.
     */
    private spawnJellyMergeSplash(resultLevel: number, x: number, y: number): void {
        const container = this.fruitContainer;
        if (!container) return;

        const fruitRadius = getFruitConfig(resultLevel).radius;
        const duration = 0.4 + Math.min(0.18, resultLevel * 0.018);

        const deviceTier = this.context?.services.deviceTier ?? 'medium';
        const baseDropCount = deviceTier === 'low' ? 6 : deviceTier === 'high' ? 10 : 8;
        const dropCount = baseDropCount + Math.floor(resultLevel / 4);
        const phase = resultLevel * 0.43;
        for (let index = 0; index < dropCount; index += 1) {
            const variation = ((index * 37 + resultLevel * 19) % 100) / 100;
            const angle = phase
                + Math.PI * 2 * index / dropCount
                + Math.sin(index * 2.31 + resultLevel) * 0.16;
            this.spawnJellyMergeDrop(
                container,
                resultLevel,
                x,
                y,
                fruitRadius,
                angle,
                variation,
                duration,
                index,
            );
        }
    }

    private spawnJellyMergeDrop(
        container: Node,
        resultLevel: number,
        x: number,
        y: number,
        fruitRadius: number,
        angle: number,
        variation: number,
        duration: number,
        index: number,
    ): void {
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);
        const startDistance = Math.max(16, fruitRadius * 0.68);
        const travelDistance = (34 + fruitRadius * (0.86 + variation * 0.25)) * 1.12;
        const width = (11 + fruitRadius * 0.06) * (0.78 + variation * 0.42) * 1.14;
        const height = width * (1.38 + variation * 0.24);
        const startX = x + directionX * startDistance;
        const startY = y + directionY * startDistance;
        const endX = x + directionX * travelDistance;
        const endY = y + directionY * travelDistance
            - travelDistance * (0.08 + variation * 0.08);
        const particle = new Node('JellySplashDropFx');
        particle.layer = container.layer;
        particle.setParent(container);
        particle.setPosition(startX, startY);
        particle.addComponent(UITransform).setContentSize(width * 2, height * 2);
        const opacity = particle.addComponent(UIOpacity);
        const graphics = particle.addComponent(Graphics);

        graphics.fillColor = jellySplashColor(resultLevel, 218, variation * 0.12);
        graphics.moveTo(0, -height * 0.54);
        graphics.bezierCurveTo(
            -width * 0.5,
            -height * 0.14,
            -width * 0.55,
            height * 0.3,
            0,
            height * 0.5,
        );
        graphics.bezierCurveTo(
            width * 0.55,
            height * 0.3,
            width * 0.5,
            -height * 0.14,
            0,
            -height * 0.54,
        );
        graphics.close();
        graphics.fill();
        graphics.strokeColor = jellySplashColor(resultLevel, 205, 0.5);
        graphics.lineWidth = Math.max(1.2, width * 0.1);
        graphics.stroke();
        graphics.fillColor = new Color(255, 255, 255, 164);
        graphics.ellipse(-width * 0.17, height * 0.2, width * 0.12, height * 0.14);
        graphics.fill();
        // A tiny detached bead behind each main drop makes the burst read as
        // stretched liquid without doubling the number of scene nodes.
        graphics.fillColor = jellySplashColor(resultLevel, 172, 0.25);
        graphics.circle(0, -height * 0.78, Math.max(2.4, width * 0.22));
        graphics.fill();

        const angleDegrees = angle * 180 / Math.PI;
        particle.angle = angleDegrees - 90;
        particle.setScale(0.28, 0.4, 1);
        this.effectNodes.add(particle);
        tween(particle)
            .to(duration * 0.34, {
                position: new Vec3(
                    startX + (endX - startX) * 0.56,
                    startY + (endY - startY) * 0.56 + height * 0.28,
                    0,
                ),
                scale: new Vec3(0.9, 1.24, 1),
                angle: angleDegrees - 90 + (index % 2 === 0 ? 8 : -8),
            }, { easing: 'quadOut' })
            .to(duration * 0.66, {
                position: new Vec3(endX, endY, 0),
                scale: new Vec3(0.52, 0.68, 1),
                angle: angleDegrees - 90 + (index % 2 === 0 ? 21 : -21),
            }, { easing: 'quadIn' })
            .call(() => this.releaseEffectNode(particle))
            .start();
        tween(opacity)
            .delay(duration * 0.38)
            .to(duration * 0.62, { opacity: 0 }, { easing: 'quadIn' })
            .start();
    }

    private releaseEffectNode(node: Node): void {
        if (!this.effectNodes.delete(node)) return;
        this.removingFruitNodes.delete(node);
        const fluid = this.fluidBodies.get(node);
        if (fluid) this.fluidWorld.remove(fluid);
        this.unbindFluidBody(node, fluid);
        Tween.stopAllByTarget(node);
        if (node.isValid) {
            const opacity = node.getComponent(UIOpacity);
            if (opacity) Tween.stopAllByTarget(opacity);
        }
        if (node.isValid) node.destroy();
    }

    private cleanupTransientEffects(): void {
        for (const node of Array.from(this.effectNodes)) {
            this.releaseEffectNode(node);
        }
    }

    private recordPlayStart(): void {
        const storage = this.context?.services.storage;

        if (!storage) {
            return;
        }

        const previous = this.saveData ?? storage.getGameData('watermelon');
        this.roundStartingHighScore = previous?.highScore ?? 0;
        this.saveData = createStartedWatermelonSave(
            previous,
            Date.now(),
        );
        this.updateProgress();
    }

    private restoreSavedRound(): boolean {
        const raw = this.saveData?.custom?.activeRound;
        const round = this.parseActiveRound(raw);
        if (!round) return false;

        try {
            this.resetRound();
            this.currentLevel = round.currentLevel;
            this.nextLevel = round.nextLevel;
            this.aimX = round.aimX;
            this.activeDropSequenceId = round.activeDropSequenceId;
            this.progress.restore({
                score: round.score,
                maxFruitLevel: round.maxFruitLevel,
            });
            for (const saved of round.fruits) {
                const fruit = this.spawnFruit(
                    saved.level,
                    saved.x,
                    saved.y,
                    saved.dropSequenceId,
                    saved.dropMergeCount,
                );
                // Point positions already contain the complete soft-body
                // orientation. Applying the legacy rigid-body angle as well
                // would rotate only the picture and double-transform it.
                fruit.node.angle = 0;
                const fluid = this.fluidBodies.get(fruit.node);
                if (fluid) {
                    if (saved.fluidPoints?.length === fluid.points.length) {
                        for (let index = 0; index < fluid.points.length; index += 1) {
                            const point = fluid.points[index];
                            const savedPoint = saved.fluidPoints[index];
                            point.x = fluid.x + savedPoint.x;
                            point.y = fluid.y + savedPoint.y;
                            // Re-entering the game is a lifecycle boundary, not
                            // a continuation of the previous frame. Keep the
                            // deformed shape, but resume it from rest so stale
                            // Verlet velocity cannot kick the pile on load.
                        }
                        this.fluidWorld.stabilize(
                            fluid,
                            WATERMELON_SEMI_FLUID.restoreDepenetrationSeconds,
                        );
                    } else {
                        // Version 3 only stored a circular body's center. Its
                        // reconstructed circles can overlap, so use the same
                        // no-impulse topology window as a newly merged cat.
                        this.fluidWorld.stabilize(
                            fluid,
                            WATERMELON_SEMI_FLUID.restoreDepenetrationSeconds,
                        );
                    }
                }
            }
            this.updateProgress();
            this.updatePreviews();
            return true;
        } catch (error: unknown) {
            console.warn('[WatermelonGame] Ignoring invalid round save.', error);
            this.clearFruits();
            return false;
        }
    }

    private parseActiveRound(value: unknown): WatermelonActiveRound | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const round = value as Record<string, unknown>;
        const isLevel = (item: unknown): item is number => Number.isInteger(item)
            && (item as number) >= 0 && (item as number) < FRUIT_LEVELS.length;
        const isFinite = (item: unknown): item is number => typeof item === 'number'
            && Number.isFinite(item);
        if (round.inProgress !== true
            || !Number.isInteger(round.score) || (round.score as number) < 0
            || !isLevel(round.maxFruitLevel)
            || !isLevel(round.currentLevel)
            || !isLevel(round.nextLevel)
            || !isFinite(round.aimX)
            || !Number.isInteger(round.activeDropSequenceId)
            || (round.activeDropSequenceId as number) < 0
            || !Array.isArray(round.fruits)) {
            return undefined;
        }

        const fruits: SavedFruit[] = [];
        for (const item of round.fruits) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
            const fruit = item as Record<string, unknown>;
            if (!isLevel(fruit.level)
                || !isFinite(fruit.x) || !isFinite(fruit.y) || !isFinite(fruit.angle)
                || !isFinite(fruit.velocityX) || !isFinite(fruit.velocityY)
                || !isFinite(fruit.angularVelocity)
                || !Number.isInteger(fruit.dropSequenceId) || (fruit.dropSequenceId as number) < 0
                || !Number.isInteger(fruit.dropMergeCount) || (fruit.dropMergeCount as number) < 0) {
                return undefined;
            }
            let fluidPoints: readonly SavedFluidPoint[] | undefined;
            if (fruit.fluidPoints !== undefined) {
                if (!Array.isArray(fruit.fluidPoints) || fruit.fluidPoints.length !== 18) {
                    return undefined;
                }
                const parsedPoints: SavedFluidPoint[] = [];
                for (const itemPoint of fruit.fluidPoints) {
                    if (!itemPoint || typeof itemPoint !== 'object' || Array.isArray(itemPoint)) {
                        return undefined;
                    }
                    const point = itemPoint as Record<string, unknown>;
                    if (!isFinite(point.x) || !isFinite(point.y)
                        || !isFinite(point.px) || !isFinite(point.py)) {
                        return undefined;
                    }
                    parsedPoints.push({
                        x: point.x,
                        y: point.y,
                        px: point.px,
                        py: point.py,
                    });
                }
                fluidPoints = Object.freeze(parsedPoints);
            }
            fruits.push({
                level: fruit.level,
                x: fruit.x,
                y: fruit.y,
                angle: fruit.angle,
                velocityX: fruit.velocityX,
                velocityY: fruit.velocityY,
                angularVelocity: fruit.angularVelocity,
                dropSequenceId: fruit.dropSequenceId as number,
                dropMergeCount: fruit.dropMergeCount as number,
                ...(fluidPoints ? { fluidPoints } : {}),
            });
        }
        return { ...(round as unknown as WatermelonActiveRound), fruits };
    }

    private persistRoundProgress(inProgress: boolean, flushImmediately = false): void {
        if (!this.context || !this.saveData) return;
        // Forced lifecycle checkpoints also restart the periodic window. Reset
        // before serialization so a storage failure cannot retry every frame.
        this.roundSaveElapsed = 0;
        this.cacheHighScore(this.progress.snapshot.score);
        const activeRound = inProgress ? this.captureActiveRound() : Object.freeze({ inProgress: false });
        const next: GameSaveData = {
            ...this.saveData,
            dataVersion: WATERMELON_DATA_VERSION,
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                ...(this.saveData.custom ?? {}),
                activeRound,
            }),
        };
        try {
            this.context.services.storage.writeGameData('watermelon', next);
            this.saveData = next;
            if (flushImmediately) {
                this.context.services.storage.flush();
            }
        } catch (error: unknown) {
            console.error('[WatermelonGame] Round save failed.', error);
        }
    }

    private captureActiveRound(): WatermelonActiveRound {
        const fruits: SavedFruit[] = [];
        const compact = (value: number): number => Math.round(value * 1000) / 1000;
        for (const child of this.fruitContainer?.children ?? []) {
            const fruit = child.getComponent(FruitBody);
            if (!fruit) continue;
            const fluid = this.fluidBodies.get(child);
            let velocityX = 0;
            let velocityY = 0;
            if (fluid) {
                for (const point of fluid.points) {
                    velocityX += (point.x - point.px)
                        * WATERMELON_SEMI_FLUID.simulationHz / fluid.points.length;
                    velocityY += (point.y - point.py)
                        * WATERMELON_SEMI_FLUID.simulationHz / fluid.points.length;
                }
            }
            fruits.push(Object.freeze({
                level: fruit.level,
                x: fluid?.x ?? child.position.x,
                y: fluid?.y ?? child.position.y,
                angle: 0,
                velocityX,
                velocityY,
                angularVelocity: 0,
                dropSequenceId: fruit.sourceDropSequenceId,
                dropMergeCount: fruit.sourceDropMergeCount,
                ...(fluid ? {
                    fluidPoints: Object.freeze(fluid.points.map((point) => Object.freeze({
                        x: compact(point.x - fluid.x),
                        y: compact(point.y - fluid.y),
                        px: compact(point.px - fluid.x),
                        py: compact(point.py - fluid.y),
                    }))),
                } : {}),
            }));
        }
        const snapshot = this.progress.snapshot;
        return Object.freeze({
            inProgress: true,
            score: snapshot.score,
            maxFruitLevel: snapshot.maxFruitLevel,
            currentLevel: this.currentLevel,
            nextLevel: this.nextLevel,
            aimX: this.aimX,
            activeDropSequenceId: this.activeDropSequenceId,
            fruits: Object.freeze(fruits),
        });
    }

    private spawnFruit(
        level: number,
        x: number,
        y: number,
        dropSequenceId = 0,
        dropMergeCount = 0,
        existingFluidBody?: WatermelonFluidBody,
    ): FruitBody {
        const container = this.fruitContainer;

        if (!container) {
            throw new Error('Fruit container is unavailable.');
        }

        // Fruit prefabs predate the soft-body solver and still serialize a
        // Graphics, RigidBody2D and CircleCollider2D. Instantiating them made
        // Box2D create and tear down a body on every drop/merge even though it
        // never owned runtime physics. Build the minimal runtime node directly.
        const fruit = new Node(`Fruit-${level}`);
        fruit.active = false;
        fruit.layer = container.layer;
        fruit.addComponent(UITransform);
        const body = fruit.addComponent(FruitBody);
        body.level = level;
        const boardWidth = container.getComponent(UITransform)?.contentSize.width
            ?? WATERMELON_BOARD_WIDTH;
        const boardHeight = container.getComponent(UITransform)?.contentSize.height
            ?? WATERMELON_BOARD_HEIGHT;
        const config = getFruitConfig(level);
        const minY = -boardHeight / 2 + WATERMELON_BOARD_BOTTOM_PADDING + config.radius;
        const maxY = boardHeight / 2
            - WATERMELON_BOARD_INNER_PADDING
            - config.radius
            - CAT_DROP_TOP_GAP;
        const spawnX = clampDropX(
            x,
            boardWidth,
            config.radius,
            WATERMELON_BOARD_SIDE_PADDING,
        );
        const spawnY = Math.max(minY, Math.min(maxY, y));
        fruit.setPosition(spawnX, spawnY);
        body.setDropChain(dropSequenceId, dropMergeCount);
        const fluid = existingFluidBody
            ?? this.fluidWorld.add(
                level,
                spawnX,
                spawnY,
                dropSequenceId > 0 ? this.fluidWorld.tilt * 20 : 0,
                -70,
            );
        this.fluidBodies.set(fruit, fluid);
        this.fluidNodes.set(fluid.id, fruit);
        body.applyConfig();
        const spriteFrame = this.spriteFrames[level];
        if (!spriteFrame) {
            fruit.destroy();
            this.unbindFluidBody(fruit, fluid);
            this.fluidWorld.remove(fluid);
            throw new Error(`Cat daily sprite frame is unavailable: ${level}.`);
        }
        body.setSpriteFrame(spriteFrame);
        fruit.setParent(container);
        fruit.active = true;
        return body;
    }

    private unbindFluidBody(node: Node, body = this.fluidBodies.get(node)): void {
        this.fluidBodies.delete(node);
        if (body && this.fluidNodes.get(body.id) === node) {
            this.fluidNodes.delete(body.id);
        }
    }

    private updatePreviews(): void {
        this.updateNextPreview();
        this.positionDropPreview();

        if (this.dropPreview) {
            this.dropPreview.active = true;
        }
        this.updateAimGuide();
    }

    private updateProgress(): void {
        const snapshot = this.progress.snapshot;
        const label = this.node.getChildByName('ScoreLabel')
            ?.getChildByName('Value')?.getComponent(Label);

        if (label) {
            label.string = String(snapshot.score);
        } else {
            const legacyLabel = this.node.getChildByName('ScoreLabel')?.getComponent(Label);
            if (legacyLabel) {
                legacyLabel.string = `分数\n${snapshot.score}`;
            }
        }

        const highScore = Math.max(this.saveData?.highScore ?? 0, snapshot.score);
        const highLabel = this.node.getChildByName('HighScoreLabel')
            ?.getChildByName('Value')?.getComponent(Label);
        if (highLabel) {
            highLabel.string = String(highScore);
        } else {
            const legacyHighLabel = this.node.getChildByName('HighScoreLabel')?.getComponent(Label);
            if (legacyHighLabel) {
                legacyHighLabel.string = `最高\n${highScore}`;
            }
        }

        this.context?.reportScore(snapshot.score);
    }

    private isGenerationCurrent(generation: number): boolean {
        return this.operationGeneration === generation
            && this.state !== 'disposed'
            && this.node.isValid;
    }

    private updateNextPreview(): void {
        const preview = this.node.getChildByName('NextFruitPreview');

        if (preview) {
            this.drawFruitPreview(preview, this.nextLevel, NEXT_CAT_PREVIEW_SIZE);
        }
    }

    private positionDropPreview(): void {
        const preview = this.dropPreview;
        const container = this.fruitContainer;

        if (!preview || !container) {
            return;
        }

        const config = getFruitConfig(this.currentLevel);
        const boardHeight = container.getComponent(UITransform)?.contentSize.height
            ?? WATERMELON_BOARD_HEIGHT;
        const boardWidth = container.getComponent(UITransform)?.contentSize.width
            ?? WATERMELON_BOARD_WIDTH;
        this.aimX = clampDropX(
            this.aimX,
            boardWidth,
            config.radius,
            WATERMELON_BOARD_SIDE_PADDING + this.gameplay.dropEdgePadding,
        );
        preview.setPosition(
            this.aimX,
            boardHeight / 2
                - WATERMELON_BOARD_INNER_PADDING
                - config.radius
                - CAT_DROP_TOP_GAP,
        );
        this.drawFruitPreview(preview, this.currentLevel);
        this.updateAimGuide();
    }

    private updateAimGuide(): void {
        const container = this.fruitContainer;
        const preview = this.dropPreview;
        if (!container || !preview || !this.dropGate.canDrop || this.gameEnding) {
            this.setAimGuideVisible(false);
            return;
        }

        let guide = container.getChildByName('AimGuide');
        if (!guide) {
            guide = new Node('AimGuide');
            guide.layer = container.layer;
            guide.setParent(container);
            guide.addComponent(UITransform).setContentSize(12, WATERMELON_BOARD_HEIGHT);
            guide.addComponent(Graphics);
            guide.setSiblingIndex(1);
        }
        guide.active = true;
        guide.setPosition(this.aimX, 0);
        const graphics = guide.getComponent(Graphics)!;
        const boardHeight = container.getComponent(UITransform)?.contentSize.height
            ?? WATERMELON_BOARD_HEIGHT;
        const startY = preview.position.y - getFruitConfig(this.currentLevel).radius - 8;
        const endY = -boardHeight / 2 + WATERMELON_BOARD_BOTTOM_PADDING + 4;
        graphics.clear();
        graphics.strokeColor = catUiColor('sky', 220);
        graphics.lineWidth = 5;
        for (let y = startY; y > endY; y -= 24) {
            graphics.moveTo(0, y);
            graphics.lineTo(0, Math.max(endY, y - 11));
        }
        graphics.stroke();
    }

    private setAimGuideVisible(visible: boolean): void {
        const guide = this.fruitContainer?.getChildByName('AimGuide');
        if (guide) {
            guide.active = visible;
        }
    }

    /** Draw UI previews from the same catalog data as the physical fruit. */
    private drawFruitPreview(
        preview: Node,
        level: number,
        fixedDisplaySize?: number,
    ): void {
        const config = getFruitConfig(level);
        const diameter = fixedDisplaySize ?? config.radius * 2;
        preview.getComponent(UITransform)?.setContentSize(diameter, diameter);
        const label = preview.getComponent(Label);

        if (label) {
            label.string = '';
        }

        const previewSize = diameter / CAT_TOKEN_VISIBLE_DIAMETER_RATIO;
        let spriteNode = preview.getChildByName('CatPreview');
        if (!spriteNode) {
            spriteNode = new Node('CatPreview');
            spriteNode.layer = preview.layer;
            spriteNode.setParent(preview);
            spriteNode.addComponent(UITransform);
            spriteNode.addComponent(Sprite);
        }
        const sprite = spriteNode.getComponent(Sprite)!;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.spriteFrames[level] ?? null;
        // Assigning a runtime-created SpriteFrame can restore raw texture size.
        // Re-assert the catalog size after the assignment.
        spriteNode.getComponent(UITransform)?.setContentSize(previewSize, previewSize);
    }
}
