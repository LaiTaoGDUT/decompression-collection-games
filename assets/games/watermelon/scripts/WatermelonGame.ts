import {
    _decorator,
    assetManager,
    BoxCollider2D,
    CircleCollider2D,
    Button,
    Color,
    Component,
    director,
    Director,
    ERigidBody2DType,
    EventTouch,
    Graphics,
    input,
    Input,
    instantiate,
    JsonAsset,
    Label,
    Node,
    Prefab,
    RigidBody2D,
    Size,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec2,
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
    refreshWatermelonHighScore,
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
const ROUND_SAVE_INTERVAL_SECONDS = 1;
const FLUID_FIXED_STEP_SECONDS = 1 / 120;
const MAX_FLUID_STEPS_PER_FRAME = 4;
const MERGE_SCORE_FONT_SIZE = 38;
const MERGE_CHAIN_SCORE_FONT_SIZE = 42;
const MERGE_SCORE_LINE_HEIGHT = 48;
const MERGE_CHAIN_SCORE_LINE_HEIGHT = 54;
const CONTINUE_CLEAR_POP_SECONDS = 0.1;
const CONTINUE_CLEAR_SHRINK_SECONDS = 0.24;
const CONTINUE_CLEAR_FADE_DELAY_SECONDS = 0.06;
const CONTINUE_CLEAR_FADE_SECONDS = 0.26;
const CONTINUE_CLEAR_STAGGER_SECONDS = 0.035;

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
    private prefabs: Prefab[] = [];
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
    private fluidAccumulator = 0;
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
            [this.prefabs, this.spriteFrames, this.popupFrames] = await Promise.all([
                this.loadFruitPrefabs(),
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

        this.roundSaveElapsed += Math.max(0, deltaTime);
        if (this.roundSaveElapsed >= ROUND_SAVE_INTERVAL_SECONDS) {
            this.roundSaveElapsed = 0;
            this.persistRoundProgress(true);
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

    pause(): void {
        if (this.state !== 'playing') {
            throw new Error(`Cannot pause WatermelonGame from ${this.state}.`);
        }

        this.state = 'paused';
        if (!this.gameEnding) this.persistRoundProgress(true);
        this.pointer.reset();
        this.cleanupTransientEffects();
        this.context?.services.audio.pauseMusic();
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
        this.persistHighScore(this.progress.snapshot.score, 'restart');
        this.persistRoundProgress(false);
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
        this.persistHighScore(this.progress.snapshot.score, 'exit');
        if (!this.gameEnding && !this.savedProgressDiscarded) {
            this.persistRoundProgress(true);
        }
        this.unscheduleAllCallbacks();
        this.unsubscribeAccelerometer?.();
        this.unsubscribeAccelerometer = undefined;
        this.context?.services.platform.stopAccelerometer();
        this.rawSensorTilt = 0;
        this.sensorTilt = 0;
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
        this.prefabs = [];
        await this.releaseFruitSpriteFramesAfterDraw();
        this.context = undefined;
        this.saveData = undefined;
        this.fruitContainer = undefined;
        this.dropPreview = undefined;
        this.state = 'disposed';
        this.gameEnding = true;
    }

    private readonly handleAccelerometer = (sample: { x: number }): void => {
        const raw = Math.max(-1, Math.min(1, sample.x));
        const deadZone = 0.04;
        this.rawSensorTilt = Math.abs(raw) <= deadZone
            ? 0
            : Math.sign(raw) * Math.min(1, (Math.abs(raw) - deadZone) / (1 - deadZone));
    };

    private handleFluidMerge(event: WatermelonFluidMergeEvent): void {
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
        this.persistRoundProgress(true);
        this.context?.services.feedback.play('fold');
        this.context?.services.feedback.play('merge');
        if (scoreEvent.isChain) this.context?.services.feedback.play('chain');
        if (scoreEvent.isMilestone) this.context?.services.feedback.play('milestone');
    }

    private loadFruitPrefabs(): Promise<Prefab[]> {
        const bundle = assetManager.getBundle('game-watermelon');

        if (!bundle) {
            return Promise.reject(new Error('game-watermelon bundle is unavailable.'));
        }

        return Promise.all(FRUIT_LEVELS.map((config) => new Promise<Prefab>(
            (resolve, reject) => {
                bundle.load(
                    config.prefab,
                    Prefab,
                    (error, prefab) => error
                        ? reject(new Error(`Fruit prefab failed: ${config.prefab}. ${error.message}`))
                        : resolve(prefab),
                );
            },
        )));
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

        if (body) {
            body.type = ERigidBody2DType.Static;
        }

        if (collider) {
            collider.size = new Size(width, height);
            collider.friction = this.gameplay.wallFriction;
            collider.restitution = this.gameplay.wallRestitution;
            collider.apply();
        }
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
        this.progress.recordSpawn(droppedLevel);
        this.updateProgress();
        this.persistRoundProgress(true);
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

    private persistHighScore(score: number, reason: 'score-update' | 'restart' | 'exit'): void {
        if (!this.context || !this.saveData) {
            return;
        }

        const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
        if (safeScore <= (this.saveData.highScore ?? 0)) {
            return;
        }

        const refreshed = refreshWatermelonHighScore(this.saveData, safeScore);
        try {
            this.context.services.storage.writeGameData('watermelon', refreshed);
            this.saveData = refreshed;
        } catch (error: unknown) {
            console.error(`[WatermelonGame] High score save failed during ${reason}.`, error);
        }
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
            label.string = '· · ·  水果警戒线  · · ·';
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

        const colors = [
            new Color(255, 112, 132, 190),
            new Color(172, 222, 92, 190),
        ];
        for (let index = 0; index < 2; index += 1) {
            const direction = index === 0 ? -1 : 1;
            const particle = new Node('JellyDropFx');
            particle.layer = container.layer;
            particle.setParent(container);
            particle.setPosition(x + direction * 7, y + 3);
            particle.addComponent(UITransform).setContentSize(34, 42);
            const particleOpacity = particle.addComponent(UIOpacity);
            const graphics = particle.addComponent(Graphics);
            graphics.fillColor = colors[index];
            graphics.moveTo(0, -15);
            graphics.bezierCurveTo(-13.5, -5, -12.5, 14, 0, 17);
            graphics.bezierCurveTo(12.5, 14, 13.5, -5, 0, -15);
            graphics.close();
            graphics.fill();
            graphics.fillColor = new Color(255, 255, 255, 145);
            graphics.ellipse(-4, 7, 3.2, 5.2);
            graphics.fill();
            particle.setScale(0.68, 0.68, 1);
            this.effectNodes.add(particle);
            tween(particleOpacity)
                .delay(0.08)
                .to(0.28, { opacity: 0 }, { easing: 'quadIn' })
                .start();
            tween(particle)
                .to(0.12, {
                    position: new Vec3(x + direction * 20, y + 24, 0),
                    scale: new Vec3(1, 1, 1),
                    angle: direction * 12,
                }, { easing: 'backOut' })
                .to(0.24, {
                    position: new Vec3(x + direction * 34, y + 48, 0),
                    scale: new Vec3(0.82, 0.82, 1),
                    angle: direction * 25,
                }, { easing: 'quadOut' })
                .call(() => this.releaseEffectNode(particle))
                .start();
        }
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

        const previous = storage.getGameData('watermelon');
        this.roundStartingHighScore = previous?.highScore ?? 0;
        this.saveData = createStartedWatermelonSave(
            previous,
            Date.now(),
        );
        try {
            storage.writeGameData('watermelon', this.saveData);
        } catch (error: unknown) {
            console.error('[WatermelonGame] Start save failed.', error);
        }
        this.updateProgress();
        this.persistRoundProgress(true);
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
            this.persistRoundProgress(true);
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

    private persistRoundProgress(inProgress: boolean): void {
        if (!this.context || !this.saveData) return;
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
                    velocityX += (point.x - point.px) * 120 / fluid.points.length;
                    velocityY += (point.y - point.py) * 120 / fluid.points.length;
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
        const prefab = this.prefabs[level];

        if (!container || !prefab) {
            throw new Error(`Fruit prefab ${level} is unavailable.`);
        }

        const fruit = instantiate(prefab);
        fruit.parent = container;
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
        const body = fruit.getComponent(FruitBody);

        if (!body) {
            fruit.destroy();
            throw new Error(`Fruit prefab ${level} has no FruitBody.`);
        }

        // The soft-body simulation is the sole runtime physics owner. Remove
        // legacy Box2D components instead of merely disabling them.
        fruit.getComponent(RigidBody2D)?.destroy();
        fruit.getComponent(CircleCollider2D)?.destroy();

        // Prefabs carry their default serialized level, but the requested level
        // is the source of truth at runtime (including a just-created merge).
        body.level = level;
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
        // The soft-body world owns translation and gravity. Keep the Cocos
        // collider only for legacy contact reporting while preventing Box2D
        // from competing with the point solver.
        const rigidBody = fruit.getComponent(RigidBody2D);
        if (rigidBody) {
            rigidBody.gravityScale = 0;
            rigidBody.linearDamping = 0;
            rigidBody.angularDamping = 0;
            rigidBody.linearVelocity = Vec2.ZERO;
            rigidBody.angularVelocity = 0;
            rigidBody.enabled = false;
        }
        const collider = fruit.getComponent(CircleCollider2D);
        if (collider) collider.enabled = false;
        const spriteFrame = this.spriteFrames[level];
        if (!spriteFrame) {
            fruit.destroy();
            this.unbindFluidBody(fruit, fluid);
            this.fluidWorld.remove(fluid);
            throw new Error(`Cat daily sprite frame is unavailable: ${level}.`);
        }
        body.setSpriteFrame(spriteFrame);
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
        this.persistHighScore(snapshot.score, 'score-update');
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
