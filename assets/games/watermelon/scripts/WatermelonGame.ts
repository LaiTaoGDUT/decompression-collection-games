import {
    _decorator,
    assetManager,
    BlockInputEvents,
    BoxCollider2D,
    Button,
    Color,
    Component,
    director,
    Director,
    ERigidBody2DType,
    EventTouch,
    Graphics,
    instantiate,
    JsonAsset,
    Label,
    Node,
    Prefab,
    RigidBody2D,
    Size,
    Sprite,
    SpriteFrame,
    Texture2D,
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
import type { DevicePerformanceTier, GameResult } from '../../../core/types/CommonTypes';
import type { Platform } from '../../../platform/Platform';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { AdService } from '../../../services/ads/AdService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type {
    GameSaveData,
    StorageService,
} from '../../../services/storage/StorageService';
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
} from './WatermelonSave';
import { SinglePointerDropController } from './WatermelonInput';
import { clampDropX, tryLockMergePair } from './WatermelonPhysicsRules';
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
    WATERMELON_BOARD_HEIGHT,
    WATERMELON_BOARD_BOTTOM_PADDING,
    WATERMELON_BOARD_INNER_PADDING,
    WATERMELON_BOARD_SIDE_PADDING,
    WATERMELON_BOARD_WIDTH,
    WATERMELON_BOARD_WALL_THICKNESS,
    WatermelonLayout,
} from './WatermelonLayout';
import {
    calculateWatermelonOverlayMetrics,
    readWatermelonViewport,
} from './WatermelonResponsiveRules';
import { CAT_UI_SHAPE, catUiColor } from './WatermelonUiTheme';

const { ccclass } = _decorator;
type WatermelonState = 'idle' | 'ready' | 'playing' | 'paused' | 'disposed';

const NEXT_CAT_PREVIEW_SIZE = 56;
const CAT_DROP_TOP_GAP = 8;
const ROUND_SAVE_INTERVAL_SECONDS = 0.25;

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

/** 合成大胖橘入口：保留原合成物理规则并切换为圆猫主题。 */
@ccclass('WatermelonGame')
export class WatermelonGame extends Component implements MiniGame {
    private state: WatermelonState = 'idle';
    private context?: MiniGameContext<WatermelonGameServices>;
    private fruitContainer?: Node;
    private dropPreview?: Node;
    private prefabs: Prefab[] = [];
    private spriteFrames: SpriteFrame[][] = [];
    private bubbleFrame?: SpriteFrame;
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
    private continueOverlay?: Node;
    private continueOffered = false;
    private continueCompleted = false;
    private terminalActionPending = false;
    private readonly effectNodes = new Set<Node>();
    private audioBank?: BundleAudioBank;
    private overlayView?: WatermelonOverlayView;
    private completedResultModel?: MiniGameResultModel;
    private randomSource: () => number = Math.random;
    private roundSaveElapsed = 0;
    private savedProgressDiscarded = false;
    private operationGeneration = 0;

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
        this.fruitContainer = container;
        this.dropPreview = preview;
        layout?.setLayoutChangeHandler(this.handleLayoutChange);
        this.overlayView = new WatermelonOverlayView(this.node, context.services.feedback);
        this.gameplay = await this.loadGameplayConfig();
        configureFruitCatalog(this.gameplay);
        this.overflowGuard = new OverflowGuard(this.gameplay.dangerOverflowSeconds);
        try {
            [this.prefabs, this.spriteFrames, this.bubbleFrame] = await Promise.all([
                this.loadFruitPrefabs(),
                this.loadFruitSpriteFrames(),
                this.loadBubbleFrame(),
            ]);
        } catch (error) {
            console.error('[WatermelonGame] Required gameplay assets failed to load.', error);
            this.destroyFruitSpriteFrames();
            this.destroyBubbleFrame();
            throw error;
        }
        this.audioBank = new BundleAudioBank({
            bundle: 'game-watermelon',
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
        container.on(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        container.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        container.on(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
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

        const stableOverflow = this.hasStableOverflow();
        const wasTiming = this.overflowGuard.isTiming;
        const finished = this.overflowGuard.advance(deltaTime, stableOverflow);

        if (stableOverflow && !wasTiming && this.overflowGuard.isTiming) {
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
        this.stopFruitVisualAnimations();
        this.context?.services.audio.pauseMusic();
    }

    resume(): void {
        if (this.state !== 'paused') {
            throw new Error(`Cannot resume WatermelonGame from ${this.state}.`);
        }

        this.state = 'playing';
        this.resumeFruitVisualAnimations();
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
        this.fruitContainer?.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.fruitContainer?.off(Node.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        this.node.getChildByName('PauseButton')?.off(
            Button.EventType.CLICK,
            this.handlePause,
            this,
        );
        const layout = this.node.getComponent(WatermelonLayout);
        layout?.setLayoutChangeHandler();
        this.clearFruitSpriteBindings();
        this.clearFruits();
        this.cleanupTransientEffects();
        this.destroyContinueOverlay();
        this.overlayView?.dispose();
        this.overlayView = undefined;
        this.completedResultModel = undefined;
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.dropGate.disable();
        this.pointer.reset();
        this.prefabs = [];
        await this.releaseFruitSpriteFramesAfterDraw();
        this.destroyBubbleFrame();
        this.context = undefined;
        this.saveData = undefined;
        this.fruitContainer = undefined;
        this.dropPreview = undefined;
        this.state = 'disposed';
        this.gameEnding = true;
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

    private loadFruitSpriteFrames(): Promise<SpriteFrame[][]> {
        const bundle = assetManager.getBundle('game-watermelon');

        if (!bundle) {
            return Promise.reject(new Error('game-watermelon bundle is unavailable.'));
        }

        return Promise.all(FRUIT_LEVELS.map((config) => Promise.all(
            config.animationSprites.map((path) => new Promise<SpriteFrame>((resolve, reject) => {
                bundle.load(path, Texture2D, (error, texture) => {
                    if (error || !texture) {
                        reject(new Error(
                            `Cat animation texture failed: ${path}. ${error?.message ?? 'Asset missing.'}`,
                        ));
                        return;
                    }
                    const spriteFrame = new SpriteFrame();
                    spriteFrame.texture = texture;
                    resolve(spriteFrame);
                });
            })),
        )));
    }

    private loadBubbleFrame(): Promise<SpriteFrame | undefined> {
        const bundle = assetManager.getBundle('game-watermelon');

        if (!bundle) {
            return Promise.resolve(undefined);
        }

        return new Promise<SpriteFrame | undefined>((resolve) => {
            bundle.load(
                'visual/ui/c1-cat-bubble-highlight-v2/texture',
                Texture2D,
                (error, texture) => {
                    if (error || !texture) {
                        console.warn(
                            '[WatermelonGame] Optional cat bubble foreground failed to load.',
                            error ?? 'Asset missing.',
                        );
                        resolve(undefined);
                        return;
                    }
                    const spriteFrame = new SpriteFrame();
                    spriteFrame.texture = texture;
                    this.bubbleFrame = spriteFrame;
                    resolve(spriteFrame);
                },
            );
        });
    }

    private destroyFruitSpriteFrames(frames = this.spriteFrames): void {
        for (const animationFrames of frames) {
            for (const spriteFrame of animationFrames) {
                if (spriteFrame.isValid) {
                    spriteFrame.destroy();
                }
            }
        }
        if (frames === this.spriteFrames) {
            this.spriteFrames = [];
        }
    }

    private destroyBubbleFrame(): void {
        if (this.bubbleFrame?.isValid) {
            this.bubbleFrame.destroy();
        }
        this.bubbleFrame = undefined;
    }

    private clearFruitSpriteBindings(): void {
        const owned = new Set<SpriteFrame>();
        for (const animationFrames of this.spriteFrames) {
            for (const spriteFrame of animationFrames) {
                owned.add(spriteFrame);
            }
        }
        if (this.bubbleFrame) {
            owned.add(this.bubbleFrame);
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

        if (!container) {
            return;
        }

        for (const child of [...container.children]) {
            if (child.getComponent(FruitBody)) {
                child.removeFromParent();
                child.destroy();
            }
        }
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
        dropped.playDropAnimation();
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
        }, this.gameplay.dropCooldownSeconds);
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

    private readonly handleFruitCollision = (
        first: FruitBody,
        second: FruitBody,
    ): void => {
        if (this.state !== 'playing'
            || this.gameEnding
            || !first.node.isValid
            || !second.node.isValid) {
            return;
        }

        first.playCollisionAnimation();
        second.playCollisionAnimation();
        this.context?.services.feedback.play('collision');
        const nextLevel = tryLockMergePair(first, second);

        if (nextLevel === undefined) {
            return;
        }
        this.context?.services.feedback.play('fold');

        const rawX = (first.node.position.x + second.node.position.x) / 2;
        const boardWidth = this.fruitContainer?.getComponent(UITransform)
            ?.contentSize.width ?? WATERMELON_BOARD_WIDTH;
        const x = clampDropX(
            rawX,
            boardWidth,
            getFruitConfig(nextLevel).radius,
            WATERMELON_BOARD_SIDE_PADDING,
        );
        const y = (first.node.position.y + second.node.position.y) / 2;
        const dropSequenceId = this.activeDropSequenceId;
        const firstContinuesDrop = dropSequenceId > 0
            && first.sourceDropSequenceId === dropSequenceId;
        const secondContinuesDrop = dropSequenceId > 0
            && second.sourceDropSequenceId === dropSequenceId;
        const continuesCurrentDrop = firstContinuesDrop || secondContinuesDrop;
        const dropMergeCount = continuesCurrentDrop
            ? Math.max(
                firstContinuesDrop ? first.sourceDropMergeCount : 0,
                secondContinuesDrop ? second.sourceDropMergeCount : 0,
            ) + 1
            : 1;
        const resultDropSequenceId = continuesCurrentDrop ? dropSequenceId : 0;
        const generation = this.operationGeneration;
        this.scheduleOnce(() => {
            if (!this.isGenerationCurrent(generation)
                || this.state !== 'playing'
                || this.gameEnding
                || !first.node.isValid
                || !second.node.isValid) {
                return;
            }

            first.node.destroy();
            second.node.destroy();
            const resultBody = this.spawnFruit(
                nextLevel,
                x,
                y,
                resultDropSequenceId,
                dropMergeCount,
            );
            const scoreEvent = this.progress.recordMerge(nextLevel, dropMergeCount);
            resultBody.playMergeReveal();
            this.spawnMergeFeedback(scoreEvent, x, y);
            this.updateProgress();
            this.persistRoundProgress(true);
            this.showMergeFeedback(scoreEvent);
            this.context?.services.feedback.play('merge');
            if (scoreEvent.isChain) {
                this.context?.services.feedback.play('chain');
            }
            if (scoreEvent.isMilestone) {
                this.context?.services.feedback.play('milestone');
            }
        }, 0);
    };

    private hasStableOverflow(): boolean {
        const container = this.fruitContainer;
        const dangerY = container?.getChildByName('DangerLine')?.position.y;

        if (!container || dangerY === undefined) {
            return false;
        }

        return container.children.some((child) => {
            const fruit = child.getComponent(FruitBody);

            if (!fruit
                || fruit.isMergeLocked
                || !fruit.canParticipateInDangerCheck(dangerY)) {
                return false;
            }

            const velocity = child.getComponent(RigidBody2D)?.linearVelocity;
            const speedSquared = velocity
                ? velocity.x * velocity.x + velocity.y * velocity.y
                : 0;
            return child.position.y + getFruitConfig(fruit.level).radius > dangerY
                // RigidBody2D velocity uses physics units rather than UI pixels.
                && speedSquared < this.gameplay.dangerStableSpeedSquared;
        });
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

        if (this.continueRule.canOffer && this.context.services.ads) {
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

        targets.forEach((item) => item.node.destroy());
        return targets.length;
    }

    private async requestContinue(): Promise<void> {
        const generation = this.operationGeneration;
        const ads = this.context?.services.ads;

        if (!ads || !this.continueRule.beginRequest()) {
            return;
        }

        this.setContinueOverlayBusy(true, '正在播放视频…');
        this.context?.services.feedback.play('uiButton');

        try {
            const result = await ads.showRewarded();
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
        this.setContinueOverlayBusy(true, '正在安抚猫咪…');
        this.context?.services.feedback.play('uiButton');
        const result = this.completeFrozenRound('failure_restart');
        this.context?.requestRestart(result);
    }

    private returnToLobbyFromFailure(): void {
        if (this.terminalActionPending) return;
        this.terminalActionPending = true;
        this.continueRule.decline();
        this.setContinueOverlayBusy(true, '正在返回大厅…');
        this.context?.services.feedback.play('uiButton');
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
        const viewport = readWatermelonViewport(this.node);
        const metrics = calculateWatermelonOverlayMetrics(
            viewport.width,
            viewport.height,
            viewport.safeTop,
            viewport.safeBottom,
            650,
            viewport.safeLeft,
            viewport.safeRight,
        );
        const overlay = new Node('ContinueOverlay');
        overlay.layer = this.node.layer;
        overlay.setParent(this.node);
        overlay.setSiblingIndex(this.node.children.length - 1);
        overlay.addComponent(BlockInputEvents);
        overlay.addComponent(UITransform).setContentSize(metrics.width, metrics.height);

        const backdrop = overlay.addComponent(Graphics);
        backdrop.fillColor = catUiColor('ink', 188);
        backdrop.rect(
            -metrics.width / 2,
            -metrics.height / 2,
            metrics.width,
            metrics.height,
        );
        backdrop.fill();

        const panel = new Node('Panel');
        panel.layer = overlay.layer;
        panel.setParent(overlay);
        panel.setPosition(metrics.contentX, metrics.panelY);
        panel.addComponent(UITransform).setContentSize(metrics.panelWidth, metrics.panelHeight);
        const panelGraphics = panel.addComponent(Graphics);
        panelGraphics.fillColor = catUiColor('ink', 38);
        panelGraphics.roundRect(
            -metrics.panelWidth / 2 + 14,
            -metrics.panelHeight / 2 - 12,
            metrics.panelWidth - 10,
            metrics.panelHeight - 10,
            CAT_UI_SHAPE.panelRadius,
        );
        panelGraphics.fill();
        panelGraphics.fillColor = catUiColor('surface');
        panelGraphics.strokeColor = catUiColor('lavender');
        panelGraphics.lineWidth = 7;
        panelGraphics.roundRect(
            -metrics.panelWidth / 2,
            -metrics.panelHeight / 2,
            metrics.panelWidth,
            metrics.panelHeight,
            CAT_UI_SHAPE.panelRadius,
        );
        panelGraphics.fill();
        panelGraphics.stroke();
        panelGraphics.fillColor = catUiColor('blush');
        panelGraphics.roundRect(-112, metrics.panelHeight / 2 - 72, 224, 40, 20);
        panelGraphics.fill();
        panelGraphics.fillColor = catUiColor('peach', 190);
        panelGraphics.circle(0, metrics.panelHeight / 2 - 52, 9);
        panelGraphics.circle(-14, metrics.panelHeight / 2 - 38, 5);
        panelGraphics.circle(0, metrics.panelHeight / 2 - 34, 5);
        panelGraphics.circle(14, metrics.panelHeight / 2 - 38, 5);
        panelGraphics.fill();

        this.createOverlayLabel(panel, 'Title', '再坚持一下？', 0, 242, 38);
        this.createOverlayLabel(panel, 'Message', '看完视频，清除越线猫咪并继续本局', 0, 184, 24);
        this.createOverlayLabel(panel, 'Status', '每局仅有一次续玩机会', 0, 139, 21);
        this.createOverlayButton(panel, 'ContinueButton', '看视频续玩', 0, 57, () => {
            void this.requestContinue();
        });
        this.createOverlayButton(panel, 'SettleButton', '查看本局结算', 0, -32, () => {
            this.declineContinue();
        }, false);
        this.createOverlayButton(panel, 'RestartButton', '再来一局', 0, -121, () => {
            this.restartFromFailure();
        });
        this.createOverlayButton(panel, 'LobbyButton', '回到大厅', 0, -210, () => {
            this.returnToLobbyFromFailure();
        }, false);
        panel.setScale(metrics.panelScale, metrics.panelScale, 1);
        this.continueOverlay = overlay;
    }

    private createOverlayLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
    ): Label {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(520, 52);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 10;
        label.color = catUiColor('ink');
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private createOverlayButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        handler: () => void,
        primary = true,
    ): void {
        const node = new Node(name);
        node.layer = parent.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        const panelWidth = parent.getComponent(UITransform)?.contentSize.width ?? 590;
        const buttonWidth = Math.min(400, panelWidth - 130);
        const buttonHeight = 66;
        node.addComponent(UITransform).setContentSize(buttonWidth, buttonHeight);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = primary
            ? catUiColor('peach')
            : catUiColor('cream');
        const labelColor = primary || name === 'RestartButton'
            ? catUiColor('surface')
            : catUiColor('ink');
        // Primary actions use a dark ink edge for contrast; secondary actions
        // keep the warm accent border used by this popup.
        graphics.strokeColor = name === 'ContinueButton'
            || name === 'RestartButton'
            ? catUiColor('ink')
            : primary ? catUiColor('surface') : catUiColor('peachDark');
        graphics.lineWidth = 5;
        graphics.roundRect(
            -buttonWidth / 2,
            -buttonHeight / 2,
            buttonWidth,
            buttonHeight,
            CAT_UI_SHAPE.buttonRadius,
        );
        graphics.fill();
        graphics.stroke();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        node.on(Button.EventType.CLICK, handler, this);

        const label = this.createOverlayLabel(node, 'Text', text, 0, 0, 26);
        label.color = labelColor;
    }

    private setContinueOverlayBusy(busy: boolean, status: string): void {
        const panel = this.continueOverlay?.getChildByName('Panel');
        const statusLabel = panel?.getChildByName('Status')?.getComponent(Label);
        if (statusLabel) {
            statusLabel.string = status;
        }
        for (const name of ['ContinueButton', 'SettleButton', 'RestartButton', 'LobbyButton']) {
            const node = panel?.getChildByName(name);
            const button = node?.getComponent(Button);
            if (button) {
                button.interactable = !busy;
            }
            const opacity = node?.getComponent(UIOpacity);
            if (opacity) opacity.opacity = busy ? 155 : 255;
        }
    }

    private destroyContinueOverlay(): void {
        this.continueOverlay?.destroy();
        this.continueOverlay = undefined;
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
            label.string = '· · ·  猫咪警戒线  · · ·';
            label.color = catUiColor('peachDark', 205);
        }
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
        const scoreWidth = event.isChain ? 270 : 180;
        const scoreHeight = event.isChain ? 72 : 54;
        scoreNode.addComponent(UITransform).setContentSize(scoreWidth, scoreHeight);
        const opacity = scoreNode.addComponent(UIOpacity);
        const labelNode = new Node('ScoreLabel');
        labelNode.layer = container.layer;
        labelNode.setParent(scoreNode);
        labelNode.addComponent(UITransform).setContentSize(scoreWidth - 20, scoreHeight - 8);
        const label = labelNode.addComponent(Label);
        label.string = event.isChain ? `连锁×${event.chainDepth}  +${event.points}` : `+${event.points}`;
        label.fontSize = event.isChain ? 38 : 29;
        label.lineHeight = event.isChain ? 50 : 38;
        label.isBold = event.isChain;
        label.color = event.isChain
            ? catUiColor('peachDark')
            : event.isMilestone
            ? catUiColor('danger')
            : catUiColor('ink');
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

        const tier = this.context?.services.deviceTier ?? 'medium';
        const particleCount = tier === 'low' ? 0 : tier === 'high' ? 8 : 4;
        const colors = [
            catUiColor('peach'),
            catUiColor('butter'),
            catUiColor('mintDark'),
            catUiColor('lavender'),
        ];
        for (let index = 0; index < particleCount; index += 1) {
            const particle = new Node('PawSparkFx');
            particle.layer = container.layer;
            particle.setParent(container);
            particle.setPosition(x, y);
            particle.addComponent(UITransform).setContentSize(22, 22);
            const particleOpacity = particle.addComponent(UIOpacity);
            const graphics = particle.addComponent(Graphics);
            graphics.fillColor = colors[index % colors.length];
            graphics.circle(0, -3, 6);
            graphics.circle(-7, 6, 3.5);
            graphics.circle(0, 9, 3.5);
            graphics.circle(7, 6, 3.5);
            graphics.fill();
            this.effectNodes.add(particle);
            const angle = (Math.PI * 2 * index) / Math.max(1, particleCount);
            const distance = 54 + (index % 3) * 12;
            tween(particleOpacity).to(0.36, { opacity: 0 }).start();
            tween(particle)
                .to(0.36, {
                    position: new Vec3(
                        x + Math.cos(angle) * distance,
                        y + 24 + Math.sin(angle) * distance,
                        0,
                    ),
                    angle: (index % 2 === 0 ? 1 : -1) * 42,
                }, { easing: 'quadOut' })
                .call(() => this.releaseEffectNode(particle))
                .start();
        }
    }

    private releaseEffectNode(node: Node): void {
        if (!this.effectNodes.delete(node)) return;
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        if (node.isValid) node.destroy();
    }

    private cleanupTransientEffects(): void {
        for (const node of [...this.effectNodes]) {
            this.releaseEffectNode(node);
        }
    }

    private stopFruitVisualAnimations(): void {
        for (const child of this.fruitContainer?.children ?? []) {
            child.getComponent(FruitBody)?.stopVisualAnimations();
        }
    }

    private resumeFruitVisualAnimations(): void {
        for (const child of this.fruitContainer?.children ?? []) {
            child.getComponent(FruitBody)?.resumeIdleAnimation();
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
                fruit.node.angle = saved.angle;
                const body = fruit.node.getComponent(RigidBody2D);
                if (body) {
                    body.linearVelocity = new Vec2(saved.velocityX, saved.velocityY);
                    body.angularVelocity = saved.angularVelocity;
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
            fruits.push(fruit as unknown as SavedFruit);
        }
        return { ...(round as unknown as WatermelonActiveRound), fruits };
    }

    private persistRoundProgress(inProgress: boolean): void {
        if (!this.context || !this.saveData) return;
        const activeRound = inProgress ? this.captureActiveRound() : Object.freeze({ inProgress: false });
        const next: GameSaveData = {
            ...this.saveData,
            dataVersion: 3,
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
        for (const child of this.fruitContainer?.children ?? []) {
            const fruit = child.getComponent(FruitBody);
            if (!fruit) continue;
            const body = child.getComponent(RigidBody2D);
            const velocity = body?.linearVelocity ?? Vec2.ZERO;
            fruits.push(Object.freeze({
                level: fruit.level,
                x: child.position.x,
                y: child.position.y,
                angle: child.angle,
                velocityX: velocity.x,
                velocityY: velocity.y,
                angularVelocity: body?.angularVelocity ?? 0,
                dropSequenceId: fruit.sourceDropSequenceId,
                dropMergeCount: fruit.sourceDropMergeCount,
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
        fruit.setPosition(
            clampDropX(
                x,
                boardWidth,
                config.radius,
                WATERMELON_BOARD_SIDE_PADDING,
            ),
            Math.max(minY, Math.min(maxY, y)),
        );
        const body = fruit.getComponent(FruitBody);

        if (!body) {
            fruit.destroy();
            throw new Error(`Fruit prefab ${level} has no FruitBody.`);
        }

        body.setCollisionHandler(this.handleFruitCollision);
        // Prefabs carry their default serialized level, but the requested level
        // is the source of truth at runtime (including a just-created merge).
        body.level = level;
        body.setDropChain(dropSequenceId, dropMergeCount);
        body.applyConfig();
        body.setAnimationFrames(this.spriteFrames[level]);
        body.setBubbleFrame(this.bubbleFrame);
        return body;
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

    private showMergeFeedback(event: WatermelonMergeScoreEvent): void {
        const label = this.node.getChildByName('Instruction')?.getComponent(Label);

        if (!label) {
            return;
        }

        label.string = event.isMilestone
            ? `新猫咪！${getFruitConfig(event.resultLevel).displayName}  +${event.points}`
            : event.isChain
                ? `连锁 ×${event.chainDepth}  +${event.points}`
                : `合成 +${event.points}`;
        label.fontSize = event.isChain ? 28 : 23;
        label.lineHeight = event.isChain ? 38 : 33;
        label.isBold = event.isChain;
        label.color = event.isChain
            ? catUiColor('peachDark')
            : catUiColor('ink', 230);
        const generation = this.operationGeneration;
        this.scheduleOnce(() => {
            if (this.isGenerationCurrent(generation)
                && label.node.isValid
                && this.state === 'playing') {
                label.string = '左右移动，松手投放';
                label.fontSize = 23;
                label.lineHeight = 33;
                label.isBold = false;
                label.color = catUiColor('ink', 230);
            }
        }, event.isChain ? 1.15 : 0.8);
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
        graphics.strokeColor = catUiColor('sky', 190);
        graphics.lineWidth = 4;
        for (let y = startY; y > endY; y -= 24) {
            graphics.moveTo(0, y);
            graphics.lineTo(0, Math.max(endY, y - 11));
        }
        graphics.stroke();
        graphics.fillColor = catUiColor('peach', 190);
        graphics.circle(0, endY - 1, 6);
        graphics.circle(-7, endY + 8, 3);
        graphics.circle(0, endY + 11, 3);
        graphics.circle(7, endY + 8, 3);
        graphics.fill();
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

        // Label and Graphics are both UI renderers. Keeping them on the same
        // node is unreliable on the browser renderer, so draw on a dedicated
        // child and leave the serialized Label only as a harmless placeholder.
        let graphicsNode = preview.getChildByName('PreviewGraphics');

        if (!graphicsNode) {
            graphicsNode = new Node('PreviewGraphics');
            graphicsNode.layer = preview.layer;
            graphicsNode.addComponent(UITransform);
            graphicsNode.setParent(preview);
        }

        graphicsNode.getComponent(UITransform)?.setContentSize(diameter, diameter);
        const graphics = graphicsNode.getComponent(Graphics)
            ?? graphicsNode.addComponent(Graphics);
        graphics.clear();
        const previewSize = diameter / CAT_TOKEN_VISIBLE_DIAMETER_RATIO;
        // The configured ball color must reach the entire circular boundary;
        // the cat artwork and highlight are layered above this backing.
        const previewRadius = previewSize / 2;
        graphics.fillColor = new Color(
            config.backgroundColor.r,
            config.backgroundColor.g,
            config.backgroundColor.b,
            255,
        );
        graphics.circle(0, 0, previewRadius);
        graphics.fill();
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
        sprite.spriteFrame = this.spriteFrames[level]?.[0] ?? null;
        // Assigning a runtime-created SpriteFrame can restore raw texture size.
        // Re-assert the catalog size after the assignment.
        spriteNode.getComponent(UITransform)?.setContentSize(previewSize, previewSize);
        let bubbleNode = preview.getChildByName('BubblePreview');
        if (!bubbleNode) {
            bubbleNode = new Node('BubblePreview');
            bubbleNode.layer = preview.layer;
            bubbleNode.setParent(preview);
            bubbleNode.addComponent(UITransform);
            bubbleNode.addComponent(Sprite);
        }
        bubbleNode.getComponent(UITransform)?.setContentSize(previewSize, previewSize);
        const bubbleSprite = bubbleNode.getComponent(Sprite)!;
        bubbleSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        bubbleSprite.spriteFrame = this.bubbleFrame ?? null;
        bubbleNode.active = !!this.bubbleFrame;
        bubbleNode.setSiblingIndex(spriteNode.getSiblingIndex() + 1);
        let ringNode = preview.getChildByName('FruitPreviewOutline');
        if (!ringNode) {
            ringNode = new Node('FruitPreviewOutline');
            ringNode.layer = preview.layer;
            ringNode.setParent(preview);
            ringNode.addComponent(UITransform);
            ringNode.addComponent(Graphics);
        }
        ringNode.active = true;
        // Keep the translucent contrast ring behind the cat. Using the cat's
        // exact sibling index makes the two nodes swap order on every redraw.
        ringNode.setSiblingIndex(Math.max(0, spriteNode.getSiblingIndex() - 1));
        ringNode.getComponent(UITransform)?.setContentSize(previewSize + 12, previewSize + 12);
        const ring = ringNode.getComponent(Graphics)!;
        const radius = previewSize / 2;
        ring.clear();
        ring.fillColor = catUiColor('ink', 28);
        ring.circle(1.5, -2, radius + 1.5);
        ring.fill();
        ring.strokeColor = new Color(105, 75, 95, 90);
        ring.lineWidth = Math.max(2, previewSize * 0.018);
        ring.circle(0, 0, Math.max(0, radius - ring.lineWidth / 2));
        ring.stroke();
    }
}
