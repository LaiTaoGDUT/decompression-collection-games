import {
    _decorator,
    assetManager,
    AudioClip,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventKeyboard,
    EventTouch,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    sys,
    Texture2D,
    tween,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    view,
} from 'cc';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { Platform } from '../../../platform/Platform';
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import {
    BOARD_SIZE,
    Game2048Model,
    TARGET_TILE,
    type Game2048Direction,
    type Game2048MoveResult,
    type Game2048Snapshot,
} from './Game2048Model';
import {
    calculateGame2048BackgroundCover,
    calculateGame2048LayoutFromPlatform,
    GAME_2048_BOARD_NODE_SIZE,
    GAME_2048_BOARD_SIZE,
    type Game2048LayoutMetrics,
} from './Game2048Layout';

const { ccclass } = _decorator;

const TILE_SLIDE_DURATION = 0.1;
const TILE_SETTLE_DURATION = 0.06;
const GAME_2048_DATA_VERSION = 3;

type Game2048State = 'idle' | 'ready' | 'playing' | 'paused' | 'target' | 'completed' | 'disposed';

export interface Game2048Services {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly platform: Platform;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'cyan' | 'amber' | 'dark';
    readonly action: () => void | Promise<void>;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: Button[];
    readonly rebuild: () => OverlayState;
    busy: boolean;
}

const COLORS = Object.freeze({
    void: new Color(5, 8, 22, 255),
    panel: new Color(16, 29, 52, 246),
    panelLight: new Color(24, 43, 70, 255),
    slot: new Color(23, 41, 67, 226),
    cyan: new Color(66, 222, 207, 255),
    cyanDim: new Color(66, 222, 207, 64),
    violet: new Color(154, 119, 244, 255),
    violetDim: new Color(154, 119, 244, 54),
    amber: new Color(246, 183, 82, 255),
    amberDim: new Color(246, 183, 82, 64),
    white: new Color(238, 249, 255, 255),
    muted: new Color(166, 194, 216, 255),
    overlay: new Color(2, 5, 14, 224),
});

type Rgb = readonly [number, number, number];

interface TileMaterial {
    readonly body: Rgb;
    readonly surface: Rgb;
    readonly facet: Rgb;
    readonly core: Rgb;
    readonly accent: Rgb;
    readonly glow: Rgb;
    readonly layerCount: number;
    readonly pulse: number;
    readonly signature: 'plasma' | 'molten' | 'ultimate';
}

const TILE_COLORS: Readonly<Record<number, Rgb>> = Object.freeze({
    2: [62, 181, 255],
    4: [137, 112, 255],
    8: [35, 224, 190],
    16: [79, 226, 116],
    32: [170, 226, 76],
    64: [255, 194, 61],
    128: [255, 139, 69],
    256: [241, 91, 158],
    512: [255, 91, 93],
    1024: [174, 76, 244],
    2048: [244, 171, 43],
    4096: [127, 52, 224],
});

// 高阶数字块拥有独立的实体材质，不用单纯加粗外框冒充升级。
const HIGH_TIER_LEVELS: Readonly<Record<number, number>> = Object.freeze({
    1024: 1,
    2048: 2,
    4096: 3,
});

const TILE_MATERIALS: Readonly<Record<number, TileMaterial>> = Object.freeze({
    1024: {
        body: [174, 76, 244],
        surface: [44, 17, 88],
        facet: [218, 132, 255],
        core: [246, 218, 255],
        accent: [92, 238, 218],
        glow: [199, 91, 255],
        layerCount: 3,
        pulse: 0.56,
        signature: 'plasma',
    },
    2048: {
        body: [244, 171, 43],
        surface: [104, 45, 18],
        facet: [255, 207, 101],
        core: [255, 239, 177],
        accent: [255, 116, 54],
        glow: [255, 190, 65],
        layerCount: 4,
        pulse: 0.46,
        signature: 'molten',
    },
    4096: {
        // 紫电 × 熔金 × 冰蓝高光：最终目标的独立配色组。
        body: [127, 52, 224],
        surface: [30, 9, 70],
        facet: [255, 175, 41],
        core: [190, 243, 255],
        accent: [125, 224, 255],
        glow: [164, 67, 255],
        layerCount: 5,
        pulse: 0.36,
        signature: 'ultimate',
    },
});

function colorWithAlpha(rgb: Rgb, alpha: number): Color {
    return new Color(rgb[0], rgb[1], rgb[2], alpha);
}

export interface HighTierTileRect {
    readonly inset: number;
    readonly size: number;
    readonly radius: number;
}

export function calculateHighTierTileRect(tileSize: number, layer: number): HighTierTileRect {
    const safeSize = Number.isFinite(tileSize) ? Math.max(2, tileSize) : 2;
    const requestedInset = Math.max(0, safeSize * (0.16 + Math.max(0, layer) * 0.09));
    const maxInset = Math.max(0, (safeSize - 2) / 2);
    const inset = Math.min(requestedInset, maxInset);
    const innerSize = Math.max(2, safeSize - inset * 2);
    const radius = Math.max(0.5, Math.min(13 + Math.max(0, layer) * 2, innerSize / 2 - 0.5));
    return { inset, size: innerSize, radius };
}

@ccclass('Game2048Game')
export class Game2048Game extends Component implements MiniGame {
    private state: Game2048State = 'idle';
    private context?: MiniGameContext<Game2048Services>;
    private readonly model = new Game2048Model();
    private boardNode?: Node;
    private boardContent?: Node;
    private scoreLabel?: Label;
    private bestLabel?: Label;
    private pauseButton?: Button;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private completedResultModel?: MiniGameResultModel;
    private targetOverlay?: OverlayState;
    private audioBank?: BundleAudioBank;
    private normalMusicClip?: AudioClip;
    private dangerMusicClip?: AudioClip;
    private dangerLayer?: Node;
    private dangerMode = false;
    private ownedBackgroundFrame?: SpriteFrame;
    private inputLocked = false;
    private touchStartX = 0;
    private touchStartY = 0;
    private playCount = 0;
    private bestScore = 0;
    private historicalHighestTile = 0;
    private roundStartingBest = 0;
    private resumableRound?: Game2048Snapshot;
    private preservedCustom: Readonly<Record<string, unknown>> = Object.freeze({});
    private savedProgressDiscarded = false;
    private layoutMetrics?: Game2048LayoutMetrics;
    private resizeListening = false;

    setRandomSourceForTesting(random: () => number): void {
        this.model.setRandomSource(random);
    }

    async initialize(context: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize Game2048Game from ${this.state}.`);
        this.context = context;
        this.readSave();
        this.buildInterface();
        await Promise.all([this.loadBackground(), this.loadMusic()]);
        this.registerInput();
        this.audioBank = new BundleAudioBank({
            bundle: 'game-2048',
            cues: {
                uiButton: 'visual/audio/t48-button-v1',
                drop: 'visual/audio/t48-move-v1',
                collision: 'visual/audio/t48-invalid-v1',
                fold: 'visual/audio/t48-spawn-v1',
                merge: 'visual/audio/t48-merge-v1',
                chain: 'visual/audio/t48-combo-v1',
                milestone: 'visual/audio/t48-target-v1',
                failure: 'visual/audio/t48-gameover-v1',
                record: 'visual/audio/t48-record-v1',
            },
        }, context.services.audio, context.services.feedback);
        void this.audioBank.initialize().catch((error: unknown) => {
            console.error('[Game2048Game] Audio initialization failed.', error);
        });
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') throw new Error(`Cannot begin Game2048Game from ${this.state}.`);
        this.startRound(true);
    }

    pause(): void {
        if (this.state !== 'playing' && this.state !== 'target') return;
        this.inputLocked = true;
        this.state = 'paused';
        this.context?.services.audio.pauseMusic();
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.services.audio.resumeMusic();
        if (this.model.needsTargetCelebration) {
            if (this.targetOverlay?.root.isValid) {
                this.state = 'target';
                this.inputLocked = true;
            } else {
                this.targetOverlay = undefined;
                this.showTargetOverlay();
            }
        }
    }

    async restart(): Promise<void> {
        if (this.state === 'disposed') throw new Error('Cannot restart a disposed Game2048Game.');
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.startRound();
    }

    discardSavedProgress(): void {
        this.savedProgressDiscarded = true;
        this.persistProgress(false);
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        if (!this.savedProgressDiscarded
            && (this.state === 'playing' || this.state === 'paused' || this.state === 'target')) {
            this.persistProgress(true);
        }
        this.state = 'disposed';
        this.unscheduleAllCallbacks();
        this.unregisterInput();
        this.setDangerMode(false, false);
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.normalMusicClip = undefined;
        this.dangerMusicClip = undefined;
        this.ownedBackgroundFrame?.destroy();
        this.ownedBackgroundFrame = undefined;
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.hidePauseMenu();
        this.pauseOverlay = this.buildOverlay(
            'Game2048PauseOverlay',
            '信号暂停',
            `当前分数  ${this.model.score}\n棋盘状态已安全冻结`,
            [
                { name: 'ResumeButton', label: '继续连接', tone: 'cyan', action: model.resume },
                { name: 'RestartButton', label: '重新开局', tone: 'amber', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = model;
        this.setPauseButtonLabel('结算');
        this.destroyOverlay(this.targetOverlay);
        this.targetOverlay = undefined;
        const extra = model.result.extra ?? {};
        const highest = typeof extra.highestTile === 'number' ? Math.floor(extra.highestTile) : this.model.highestTile;
        const reason = extra.reason === 'target-complete' ? '目标达成' : '信号结束';
        const record = extra.newRecord === true;
        this.resultOverlay = this.buildOverlay(
            'Game2048ResultOverlay',
            record ? '新纪录' : reason,
            `最终分数  ${model.result.score}\n本局最高数字  ${highest}`,
            [
                { name: 'RestartButton', label: '再来一局', tone: 'amber', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.returnToLobby },
                {
                    name: 'InspectBoardButton',
                    label: '关闭并查看棋盘',
                    tone: 'cyan',
                    action: () => this.dismissResultOverlay(),
                },
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.completedResultModel = undefined;
        this.setPauseButtonLabel('暂停');
    }

    private startRound(allowResume = false): void {
        this.savedProgressDiscarded = false;
        const savedRound = allowResume ? this.resumableRound : undefined;
        this.resumableRound = undefined;
        if (savedRound) {
            this.model.restore(savedRound);
        } else {
            this.model.reset();
            this.playCount += 1;
        }
        const resumedTarget = !!savedRound
            && this.model.needsTargetCelebration;
        const resumedDeadTarget = !!savedRound
            && this.model.highestTile >= TARGET_TILE
            && !this.model.hasAvailableMove;
        this.roundStartingBest = this.bestScore;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.reportScore(0);
        this.completedResultModel = undefined;
        this.setPauseButtonLabel('暂停');
        this.persistProgress(true);
        this.renderBoard();
        this.refreshHud();
        if (resumedTarget) this.showTargetOverlay();
        else if (resumedDeadTarget) this.finishRound('target-complete');
        else this.updateDangerState();
    }

    private registerInput(): void {
        this.node.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.pauseButton?.node.on(Button.EventType.CLICK, this.handlePause, this);
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (!this.resizeListening) {
            view.on('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = true;
        }
    }

    private unregisterInput(): void {
        this.node.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
    }

    private readonly handleCanvasResize = (): void => {
        if (!this.node.isValid || this.state === 'disposed' || this.state === 'idle') return;

        const pauseRebuild = this.pauseOverlay?.rebuild;
        const resultRebuild = this.resultOverlay?.rebuild;
        const targetRebuild = this.targetOverlay?.rebuild;
        const shouldRestoreDanger = this.dangerMode;
        const wasPaused = this.state === 'paused';
        const wasCompleted = this.state === 'completed';
        const wasTarget = this.state === 'target';

        this.unregisterInput();
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.targetOverlay = undefined;
        this.dangerLayer = undefined;
        this.buildInterface();
        this.renderBoard();
        this.refreshHud();
        if (shouldRestoreDanger) {
            const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
            this.createDangerLayer(emptyCount);
        }
        this.registerInput();
        void this.loadBackground();

        if (wasPaused && pauseRebuild) {
            this.pauseOverlay = pauseRebuild();
        } else if (wasCompleted && resultRebuild) {
            this.resultOverlay = resultRebuild();
        } else if (wasTarget && targetRebuild) {
            this.targetOverlay = targetRebuild();
        }
    };

    private readonly handleTouchStart = (event: EventTouch): void => {
        const location = event.getUILocation();
        this.touchStartX = location.x;
        this.touchStartY = location.y;
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        const location = event.getUILocation();
        const deltaX = location.x - this.touchStartX;
        const deltaY = location.y - this.touchStartY;
        if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 42) return;
        const direction: Game2048Direction = Math.abs(deltaX) > Math.abs(deltaY)
            ? (deltaX > 0 ? 'right' : 'left')
            : (deltaY > 0 ? 'up' : 'down');
        this.performMove(direction);
    };

    private readonly handleKeyDown = (event: EventKeyboard): void => {
        const directions: Partial<Record<KeyCode, Game2048Direction>> = {
            [KeyCode.ARROW_LEFT]: 'left',
            [KeyCode.KEY_A]: 'left',
            [KeyCode.ARROW_RIGHT]: 'right',
            [KeyCode.KEY_D]: 'right',
            [KeyCode.ARROW_UP]: 'up',
            [KeyCode.KEY_W]: 'up',
            [KeyCode.ARROW_DOWN]: 'down',
            [KeyCode.KEY_S]: 'down',
        };
        const direction = directions[event.keyCode];
        if (direction) this.performMove(direction);
    };

    private readonly handlePause = (): void => {
        if (this.state === 'completed' && this.completedResultModel) {
            this.context?.services.feedback.play('uiButton');
            this.showResultView(this.completedResultModel);
            return;
        }
        if (this.state !== 'playing' || this.inputLocked) return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private performMove(direction: Game2048Direction): void {
        if (this.state !== 'playing' || this.inputLocked) return;
        const result = this.model.move(direction);
        if (!result.changed) {
            this.context?.services.feedback.play('collision');
            if (result.gameOver) this.finishRound('no-moves');
            return;
        }

        this.inputLocked = true;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.context?.reportScore(this.model.score);
        this.playMoveFeedback(result);
        this.animateBoardMove(result);
        this.refreshHud();
        this.persistProgress();

        this.scheduleOnce(() => {
            if (this.state === 'disposed') return;
            this.renderBoard(result);
            this.playHighMergeFeedback(result);
            this.updateDangerState(result.gameOver);
        }, TILE_SLIDE_DURATION);

        this.scheduleOnce(() => {
            if (this.state !== 'playing') return;
            this.inputLocked = false;
            this.refreshHud();
            if (result.reachedTarget) {
                this.showTargetOverlay();
            } else if (result.gameOver) {
                this.finishRound('no-moves');
            }
        }, TILE_SLIDE_DURATION + TILE_SETTLE_DURATION);
    }

    private playMoveFeedback(result: Game2048MoveResult): void {
        if (result.mergedIndices.length > 1) this.context?.services.feedback.play('chain');
        else if (result.mergedIndices.length === 1) this.context?.services.feedback.play('merge');
        else this.context?.services.feedback.play('drop');
    }

    private playHighMergeFeedback(result: Game2048MoveResult): void {
        const highest = this.highestMergedValue(result);
        if (highest < 128) {
            if (result.reachedTarget) this.context?.services.feedback.play('milestone');
            return;
        }

        const level = Math.min(5, Math.max(1, Math.log2(highest) - 6));
        const feedback = this.context?.services.feedback;
        if (!feedback) return;

        // 大数字合成的独立震感与方块落位动效同步，并随数字等级增强。
        feedback.vibrate(level >= 3 ? 'heavy' : 'medium');

        if (level === 1) {
            feedback.play('fold');
            return;
        }

        feedback.play('chain');
        if (level >= 3 && level !== 4) {
            this.scheduleOnce(() => {
                if (this.state !== 'disposed') feedback.play('fold');
            }, 0.035);
        }
        if (level >= 4) {
            this.scheduleOnce(() => {
                if (this.state !== 'disposed') feedback.play('milestone');
            }, level >= 5 ? 0.07 : 0.045);
        }
    }

    private highestMergedValue(result: Game2048MoveResult): number {
        return result.mergedIndices.reduce(
            (highest, index) => Math.max(highest, this.model.board[index] ?? 0),
            0,
        );
    }

    private showTargetOverlay(): void {
        if (this.state !== 'playing' || !this.model.needsTargetCelebration) return;
        this.state = 'target';
        this.inputLocked = true;
        this.targetOverlay = this.buildTargetOverlay(
            [
                {
                    name: 'ContinueButton',
                    label: '继续冲击更高纪录',
                    tone: 'cyan',
                    action: () => {
                        this.model.acknowledgeTarget();
                        this.persistProgress(true);
                        this.destroyOverlay(this.targetOverlay);
                        this.targetOverlay = undefined;
                        if (!this.model.hasAvailableMove) {
                            this.finishRound('target-complete');
                            return;
                        }
                        this.state = 'playing';
                        this.inputLocked = false;
                        this.updateDangerState();
                    },
                },
                {
                    name: 'FinishButton',
                    label: '完成本局',
                    tone: 'amber',
                    action: () => this.finishRound('target-complete'),
                },
                {
                    name: 'LobbyButton',
                    label: '返回大厅',
                    tone: 'dark',
                    action: () => {
                        const result = this.createResult('target-complete');
                        this.persistProgress();
                        this.context?.requestLobby(result);
                    },
                },
            ],
        );
    }

    private finishRound(reason: 'no-moves' | 'target-complete'): void {
        if (this.state === 'completed' || this.state === 'disposed') return;
        this.state = 'completed';
        this.inputLocked = true;
        this.setDangerMode(false, false);
        this.context?.services.audio.pauseMusic();
        const newRecord = this.model.score > this.roundStartingBest;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.persistProgress(false);
        if (reason === 'no-moves') this.context?.services.feedback.play('failure');
        if (newRecord) this.context?.services.feedback.play('record');
        this.context?.requestExit(this.createResult(reason));
    }

    private createResult(reason: 'no-moves' | 'target-complete') {
        return Object.freeze({
            score: this.model.score,
            duration: 0,
            completed: true,
            extra: Object.freeze({
                reason,
                highestTile: this.model.highestTile,
                newRecord: this.model.score > this.roundStartingBest,
            }),
        });
    }

    private readSave(): void {
        const data = this.context?.services.storage.getGameData('game2048');
        const custom = data?.custom;
        this.preservedCustom = custom && typeof custom === 'object' && !Array.isArray(custom)
            ? Object.freeze({ ...custom })
            : Object.freeze({});
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        const highest = data?.custom?.highestTile;
        this.historicalHighestTile = typeof highest === 'number' && Number.isFinite(highest)
            ? Math.max(0, Math.floor(highest))
            : 0;
        this.resumableRound = this.readResumableRound(data);
    }

    private readResumableRound(data?: GameSaveData): Game2048Snapshot | undefined {
        const round = data?.custom?.activeRound;
        if (!round || typeof round !== 'object' || Array.isArray(round)) return undefined;
        const value = round as Record<string, unknown>;
        if (value.inProgress !== true
            || !Array.isArray(value.board)
            || typeof value.score !== 'number'
            || typeof value.targetAcknowledged !== 'boolean') {
            return undefined;
        }

        try {
            const snapshot: Game2048Snapshot = {
                board: value.board as number[],
                score: value.score,
                targetAcknowledged: this.migrateTargetAcknowledgement(
                    data?.dataVersion ?? 1,
                    value.targetAcknowledged,
                ),
            };
            this.model.restore(snapshot);
            if (!this.model.hasAvailableMove && this.model.highestTile < TARGET_TILE) return undefined;
            return this.model.snapshot;
        } catch (error: unknown) {
            console.warn('[Game2048Game] Ignoring invalid round save.', error);
            return undefined;
        }
    }

    private migrateTargetAcknowledgement(dataVersion: number, acknowledged: boolean): boolean {
        // v1/v2 的 true 只代表“2048 目标层已确认”，对 v3 的 4096 目标必须重置为未确认。
        return dataVersion < GAME_2048_DATA_VERSION ? false : acknowledged;
    }

    private persistProgress(inProgress = true): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const previousRound = this.preservedCustom.activeRound;
        const previousRoundFields = previousRound
            && typeof previousRound === 'object'
            && !Array.isArray(previousRound)
            ? previousRound as Record<string, unknown>
            : {};
        const data: GameSaveData = {
            dataVersion: GAME_2048_DATA_VERSION,
            playCount: this.playCount,
            highScore: Math.max(this.bestScore, this.model.score),
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                ...this.preservedCustom,
                highestTile: Math.max(this.historicalHighestTile, this.model.highestTile),
                activeRound: Object.freeze({
                    ...previousRoundFields,
                    inProgress,
                    ...this.model.snapshot,
                }),
            }),
        };
        try {
            storage.writeGameData('game2048', data);
        } catch (error: unknown) {
            console.error('[Game2048Game] Save failed.', error);
        }
    }

    private buildInterface(): void {
        this.node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        const metrics = this.readLayoutMetrics();
        this.layoutMetrics = metrics;
        const { width, height } = metrics;
        this.node.getComponent(UITransform)?.setContentSize(width, height);

        const backdropBleed = 32;
        const backgroundImage = this.createNode(
            this.node,
            'BackgroundImage',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        backgroundImage.setSiblingIndex(0);
        const backdrop = this.createNode(
            this.node,
            'NeonBackdrop',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        const background = backdrop.addComponent(Graphics);
        background.fillColor = new Color(COLORS.void.r, COLORS.void.g, COLORS.void.b, 94);
        background.rect(
            -(width + backdropBleed) / 2,
            -(height + backdropBleed) / 2,
            width + backdropBleed,
            height + backdropBleed,
        );
        background.fill();

        // Wide, low-alpha pools create a neon atmosphere without leaving bright hotspots.
        [
            { x: -width * 0.48, y: height * 0.35, radius: 310, color: COLORS.cyan, alpha: 9 },
            { x: -width * 0.48, y: height * 0.35, radius: 220, color: COLORS.cyan, alpha: 12 },
            { x: -width * 0.48, y: height * 0.35, radius: 145, color: COLORS.cyan, alpha: 15 },
            { x: width * 0.48, y: height * 0.22, radius: 270, color: COLORS.violet, alpha: 9 },
            { x: width * 0.48, y: height * 0.22, radius: 178, color: COLORS.violet, alpha: 12 },
            { x: width * 0.46, y: -height * 0.34, radius: 300, color: COLORS.amber, alpha: 7 },
            { x: width * 0.46, y: -height * 0.34, radius: 195, color: COLORS.amber, alpha: 10 },
        ].forEach((glow) => {
            background.fillColor = new Color(glow.color.r, glow.color.g, glow.color.b, glow.alpha);
            background.circle(glow.x, glow.y, glow.radius);
            background.fill();
        });

        background.strokeColor = new Color(65, 145, 163, 28);
        background.lineWidth = 1;
        const gridXs: number[] = [];
        const gridYs: number[] = [];
        for (let x = -width / 2 + 48; x < width / 2; x += 84) {
            gridXs.push(x);
            background.moveTo(x, -height / 2);
            background.lineTo(x, height / 2);
        }
        background.stroke();
        background.strokeColor = new Color(127, 102, 189, 22);
        for (let y = -height / 2 + 38; y < height / 2; y += 84) {
            gridYs.push(y);
            background.moveTo(-width / 2, y);
            background.lineTo(width / 2, y);
        }
        background.stroke();

        gridXs.forEach((x, column) => {
            gridYs.forEach((y, row) => {
                if ((column * 3 + row * 5) % 11 !== 0) return;
                const accent = (column + row) % 3 === 0 ? COLORS.violet : COLORS.cyan;
                background.fillColor = new Color(accent.r, accent.g, accent.b, 42);
                background.circle(x, y, 2.4);
                background.fill();
            });
        });

        const titleFrame = this.createNode(this.node, 'TitleCircuit', metrics.titleX, metrics.titleY, 390, 92);
        titleFrame.setScale(metrics.fitScale, metrics.fitScale, 1);
        const titleGraphics = titleFrame.addComponent(Graphics);
        titleGraphics.fillColor = new Color(0, 0, 0, 82);
        titleGraphics.roundRect(-190, -52, 390, 92, 24);
        titleGraphics.fill();
        titleGraphics.fillColor = new Color(COLORS.panel.r, COLORS.panel.g, COLORS.panel.b, 244);
        titleGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 168);
        titleGraphics.lineWidth = 3;
        titleGraphics.roundRect(-195, -46, 390, 92, 24);
        titleGraphics.fill();
        titleGraphics.stroke();
        titleGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 92);
        titleGraphics.lineWidth = 1;
        titleGraphics.roundRect(-186, -37, 372, 74, 18);
        titleGraphics.stroke();
        titleGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 170);
        titleGraphics.lineWidth = 2;
        titleGraphics.moveTo(-158, 30);
        titleGraphics.lineTo(-72, 30);
        titleGraphics.moveTo(72, 30);
        titleGraphics.lineTo(158, 30);
        titleGraphics.stroke();
        titleGraphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 155);
        titleGraphics.circle(-166, 30, 3);
        titleGraphics.circle(166, 30, 3);
        titleGraphics.fillColor = new Color(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 210);
        titleGraphics.circle(-166, -27, 3);
        titleGraphics.circle(166, -27, 3);
        titleGraphics.fill();
        const kicker = this.createLabel(titleFrame, 'TitleKicker', 'SIGNAL  //  MERGE MATRIX', 0, 25, 12, COLORS.cyan, 310, 20);
        kicker.spacingX = 2;
        const titleVioletGlow = this.createLabel(titleFrame, 'TitleVioletGlow', 'NEON  2048', 2, -10, 39,
            new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 72), 340, 52);
        titleVioletGlow.isBold = true;
        titleVioletGlow.spacingX = 4;
        const title = this.createLabel(titleFrame, 'Title', 'NEON  2048', 0, -7, 37, COLORS.white, 340, 50);
        title.isBold = true;
        title.spacingX = 4;
        this.pauseButton = this.createButton(
            this.node,
            'PauseButton',
            '暂停',
            metrics.pauseX,
            metrics.pauseY,
            104,
            52,
            'dark',
        );
        // 霓光面板维持轻薄外观，实际触摸热区扩展到 104×88。
        this.pauseButton.node.getComponent(UITransform)?.setContentSize(104, 88);
        this.pauseButton.node.setScale(metrics.fitScale, metrics.fitScale, 1);

        this.scoreLabel = this.createHudCard(metrics.scoreLeftX, metrics.scoreY, '分数', COLORS.cyan, metrics.fitScale);
        this.bestLabel = this.createHudCard(metrics.scoreRightX, metrics.scoreY, '最高', COLORS.amber, metrics.fitScale);

        const boardSize = GAME_2048_BOARD_SIZE;
        this.boardNode = this.createNode(
            this.node,
            'BoardPanel',
            metrics.boardX,
            metrics.boardY,
            GAME_2048_BOARD_NODE_SIZE,
            GAME_2048_BOARD_NODE_SIZE,
        );
        this.boardNode.setScale(metrics.boardScale, metrics.boardScale, 1);
        const boardGraphics = this.boardNode.addComponent(Graphics);
        boardGraphics.fillColor = new Color(0, 0, 0, 80);
        boardGraphics.roundRect(-boardSize / 2 - 7, -boardSize / 2 - 13, boardSize + 18, boardSize + 18, 34);
        boardGraphics.fill();
        boardGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 30);
        boardGraphics.lineWidth = 12;
        boardGraphics.roundRect(-boardSize / 2 - 7, -boardSize / 2 - 7, boardSize + 14, boardSize + 14, 36);
        boardGraphics.stroke();
        boardGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 34);
        boardGraphics.lineWidth = 7;
        boardGraphics.roundRect(-boardSize / 2 - 4, -boardSize / 2 - 4, boardSize + 8, boardSize + 8, 33);
        boardGraphics.stroke();
        boardGraphics.fillColor = COLORS.panel;
        boardGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 148);
        boardGraphics.lineWidth = 2.5;
        boardGraphics.roundRect(-boardSize / 2, -boardSize / 2, boardSize, boardSize, 30);
        boardGraphics.fill();
        boardGraphics.stroke();
        boardGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 55);
        boardGraphics.lineWidth = 1;
        boardGraphics.roundRect(-boardSize / 2 + 7, -boardSize / 2 + 7, boardSize - 14, boardSize - 14, 25);
        boardGraphics.stroke();
        this.boardContent = this.createNode(this.boardNode, 'BoardContent', 0, 0, boardSize, boardSize);
        this.buildSlots(boardSize);

        this.createLabel(
            this.node,
            'Hint',
            '',
            metrics.hintX,
            metrics.hintY,
            22 * metrics.fitScale,
            COLORS.muted,
            metrics.hintWidth,
            metrics.hintHeight,
        );
    }

    private readLayoutMetrics(): Game2048LayoutMetrics {
        const canvasSize = this.node.parent?.getComponent(UITransform)?.contentSize;
        const visible = view.getVisibleSize();
        const width = visible.width > 0 ? visible.width : canvasSize?.width ?? 750;
        const height = visible.height > 0 ? visible.height : canvasSize?.height ?? 1334;
        const safeRect = sys.getSafeAreaRect();
        const scaleX = visible.width > 0 ? width / visible.width : 1;
        const scaleY = visible.height > 0 ? height / visible.height : 1;
        const systemSafeLeft = Math.max(0, safeRect.x) * scaleX;
        const systemSafeRight = Math.max(0, visible.width - safeRect.x - safeRect.width) * scaleX;
        const systemSafeTop = Math.max(0, visible.height - safeRect.y - safeRect.height) * scaleY;
        const systemSafeBottom = Math.max(0, safeRect.y) * scaleY;
        return calculateGame2048LayoutFromPlatform(
            width,
            height,
            this.context?.services.platform.getLayoutInfo(),
            {
                safeTop: systemSafeTop,
                safeBottom: systemSafeBottom,
                safeLeft: systemSafeLeft,
                safeRight: systemSafeRight,
            },
        );
    }

    private loadBackground(): Promise<void> {
        const bundle = assetManager.getBundle('game-2048');
        const background = this.node.getChildByName('BackgroundImage');
        if (!bundle || !background) return Promise.resolve();

        return new Promise((resolve) => {
            bundle.load('visual/backgrounds/t48-neon-v2/texture', Texture2D, (error, texture) => {
                if (!error && texture && this.node.isValid && background.isValid) {
                    const sprite = background.addComponent(Sprite);
                    const spriteFrame = new SpriteFrame();
                    spriteFrame.texture = texture;
                    this.ownedBackgroundFrame?.destroy();
                    this.ownedBackgroundFrame = spriteFrame;
                    sprite.spriteFrame = spriteFrame;
                    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                    sprite.color = new Color(255, 255, 255, 255);

                    const rootSize = this.node.getComponent(UITransform)?.contentSize;
                    const targetWidth = rootSize?.width ?? 750;
                    const targetHeight = rootSize?.height ?? 1334;
                    const cover = calculateGame2048BackgroundCover(targetWidth, targetHeight);
                    // Cover 只按统一比例放大，超出视口的部分交给 Camera 裁切，禁止非等比拉伸。
                    background.getComponent(UITransform)?.setContentSize(cover.width, cover.height);
                } else if (error) {
                    console.warn('[Game2048Game] Neon background failed to load.', error);
                }
                resolve();
            });
        });
    }

    private async loadMusic(): Promise<void> {
        const bundle = assetManager.getBundle('game-2048');
        if (!bundle) return;
        const loadClip = (assetPath: string): Promise<AudioClip> => new Promise((resolve, reject) => {
            bundle.load(assetPath, AudioClip, (error, clip) => error ? reject(error) : resolve(clip));
        });
        const [normal, danger] = await Promise.all([
            loadClip('visual/audio/t48-neon-loop-v1').catch((error: unknown) => {
                console.warn('[Game2048Game] Normal music failed to load.', error);
                return undefined;
            }),
            loadClip('visual/audio/t48-danger-loop-v1').catch((error: unknown) => {
                console.warn('[Game2048Game] Danger music failed to load.', error);
                return undefined;
            }),
        ]);
        if (!this.node.isValid || this.state === 'disposed') return;
        if (normal) {
            this.normalMusicClip = normal;
            this.context?.services.audio.playMusic(normal);
        }
        this.dangerMusicClip = danger;
    }

    private buildSlots(boardSize: number): void {
        if (!this.boardContent) return;
        const gap = this.boardGap(boardSize);
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;
        const radius = Math.min(20, tileSize / 2);
        const highlightInset = Math.min(20, tileSize * 0.16);
        const highlightY = tileSize / 2 - Math.min(9, tileSize * 0.07);
        for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
            const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
            const slot = this.createNode(this.boardContent, `Slot-${index}`, x, y, tileSize, tileSize);
            const graphics = slot.addComponent(Graphics);
            graphics.fillColor = COLORS.slot;
            graphics.strokeColor = new Color(91, 157, 177, 36);
            graphics.lineWidth = 1;
            graphics.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, radius);
            graphics.fill();
            graphics.stroke();
            graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 20);
            graphics.moveTo(-tileSize / 2 + highlightInset, highlightY);
            graphics.lineTo(tileSize / 2 - highlightInset, highlightY);
            graphics.stroke();
        }
    }

    private renderBoard(result?: Game2048MoveResult): void {
        const content = this.boardContent;
        const panel = this.boardNode?.getComponent(UITransform);
        if (!content || !panel) return;
        content.children.filter((child) => child.name.startsWith('Tile-')).forEach((child) => {
            this.destroyNodeWithTweens(child);
        });
        const boardSize = content.getComponent(UITransform)?.contentSize.width
            ?? panel.contentSize.width - 24;
        const gap = this.boardGap(boardSize);
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;

        this.model.board.forEach((value, index) => {
            if (value === 0) return;
            const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
            const tile = this.createNode(content, `Tile-${index}`, x, y, tileSize, tileSize);
            this.drawTile(tile, value, tileSize);
            if (result?.spawned?.index === index) {
                tile.setScale(0.45, 0.45, 1);
                tween(tile).to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            } else if ((result?.mergedIndices.indexOf(index) ?? -1) >= 0) {
                const effectLevel = value >= 128
                    ? Math.min(5, Math.max(1, Math.log2(value) - 6))
                    : 0;
                const peakScale = 1.1 + effectLevel * 0.025;
                const startScale = effectLevel > 0 ? 0.68 : 0.78;
                tile.setScale(startScale, startScale, 1);
                tween(tile)
                    .to(0.07, { scale: new Vec3(peakScale, peakScale, 1) }, { easing: 'quadOut' })
                    .to(0.06, { scale: new Vec3(1, 1, 1) })
                    .start();
            }
        });

        result?.mergedIndices.forEach((index) => {
            const value = this.model.board[index] ?? 0;
            if (value >= 128) {
                this.createHighMergeEffect(content, index, value, boardSize, gap, tileSize);
            }
        });
    }

    private animateBoardMove(result: Game2048MoveResult): void {
        const content = this.boardContent;
        const panel = this.boardNode?.getComponent(UITransform);
        if (!content || !panel) return;
        const boardSize = content.getComponent(UITransform)?.contentSize.width
            ?? panel.contentSize.width - 24;
        const gap = this.boardGap(boardSize);
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;

        result.tileMotions.forEach((motion) => {
            const tile = content.getChildByName(`Tile-${motion.fromIndex}`);
            if (!tile || motion.fromIndex === motion.toIndex) return;
            const destination = this.tilePosition(motion.toIndex, boardSize, gap, tileSize);
            Tween.stopAllByTarget(tile);
            tile.setSiblingIndex(content.children.length - 1);
            tween(tile)
                .to(
                    TILE_SLIDE_DURATION,
                    { position: new Vec3(destination.x, destination.y, 0) },
                    { easing: 'quadOut' },
                )
                .start();
        });
    }

    private boardGap(boardSize: number): number {
        return Math.max(0.5, boardSize * 13 / GAME_2048_BOARD_SIZE);
    }

    private createHighMergeEffect(
        content: Node,
        index: number,
        value: number,
        boardSize: number,
        gap: number,
        tileSize: number,
    ): void {
        const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
        const material = TILE_MATERIALS[value];
        const rgb: Rgb = material?.glow ?? TILE_COLORS[value] ?? [255, 220, 75];
        const accent: Rgb = material?.accent ?? rgb;
        const level = Math.min(5, Math.max(1, Math.log2(value) - 6));
        const tier = HIGH_TIER_LEVELS[value] ?? 0;
        const eliteBoost = (level >= 3 ? 1 + (level - 2) * 0.14 : 1) + tier * 0.08;
        const ringCount = Math.min(10, level + 1 + (level >= 3 ? 1 : 0) + tier);

        const flash = this.createNode(content, `MergeFlash-${index}-${value}`, x, y, tileSize, tileSize);
        flash.setSiblingIndex(content.children.length - 1);
        const flashOpacity = flash.addComponent(UIOpacity);
        flashOpacity.opacity = Math.min(255, (150 + level * 16) * eliteBoost);
        const flashGraphics = flash.addComponent(Graphics);
        flashGraphics.fillColor = colorWithAlpha(material?.surface ?? rgb, 50 + level * 9 + tier * 12);
        flashGraphics.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, 20);
        flashGraphics.fill();
        if (material) {
            flashGraphics.fillColor = colorWithAlpha(material.core, 42 + tier * 18);
            flashGraphics.moveTo(0, -tileSize * 0.28);
            flashGraphics.lineTo(tileSize * 0.28, 0);
            flashGraphics.lineTo(0, tileSize * 0.28);
            flashGraphics.lineTo(-tileSize * 0.28, 0);
            flashGraphics.close();
            flashGraphics.fill();
        }
        flash.setScale(0.7, 0.7, 1);
        tween(flash)
            .to(
                0.13 + level * 0.015 + tier * 0.02,
                { scale: new Vec3((1.18 + level * 0.04 + tier * 0.08) * eliteBoost, (1.18 + level * 0.04 + tier * 0.08) * eliteBoost, 1) },
                { easing: 'quadOut' },
            )
            .start();
        tween(flashOpacity)
            .to(0.15 + level * 0.018 + tier * 0.02, { opacity: 0 })
            .call(() => this.destroyNodeWithTweens(flash))
            .start();

        for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
            const ring = this.createNode(content, `MergeRing-${index}-${value}-${ringIndex}`, x, y, tileSize, tileSize);
            ring.setSiblingIndex(content.children.length - 1);
            const opacity = ring.addComponent(UIOpacity);
            opacity.opacity = Math.max(100, 230 - ringIndex * 20);
            const graphics = ring.addComponent(Graphics);
            graphics.strokeColor = colorWithAlpha(ringIndex % 3 === 0 ? accent : rgb, 235);
            graphics.lineWidth = (2 + Math.min(3, level * 0.6) + tier * 0.7) * eliteBoost;
            graphics.circle(0, 0, tileSize * (0.32 + ringIndex * 0.025));
            graphics.stroke();
            if (level >= 3 && ringIndex < 2) {
                graphics.moveTo(-tileSize * 0.4, 0);
                graphics.lineTo(tileSize * 0.4, 0);
                graphics.moveTo(0, -tileSize * 0.4);
                graphics.lineTo(0, tileSize * 0.4);
                graphics.stroke();
            }
            if (tier >= 2 && ringIndex % 2 === 0) {
                graphics.moveTo(-tileSize * 0.31, -tileSize * 0.31);
                graphics.lineTo(tileSize * 0.31, tileSize * 0.31);
                graphics.moveTo(-tileSize * 0.31, tileSize * 0.31);
                graphics.lineTo(tileSize * 0.31, -tileSize * 0.31);
                graphics.stroke();
            }
            const startScale = 0.58 + ringIndex * 0.07;
            const duration = 0.18 + level * 0.025 + ringIndex * 0.018 + tier * 0.025;
            const endScale = (1.25 + level * 0.12 + ringIndex * 0.1 + tier * 0.08) * eliteBoost;
            ring.setScale(startScale, startScale, 1);
            tween(ring)
                .delay(ringIndex * 0.018)
                .to(duration, { scale: new Vec3(endScale, endScale, 1) }, { easing: 'quadOut' })
                .start();
            tween(opacity)
                .delay(ringIndex * 0.018)
                .to(duration, { opacity: 0 })
                .call(() => this.destroyNodeWithTweens(ring))
                .start();
        }

        if (material) this.createHighTierMergeCore(content, index, value, x, y, tileSize, material, tier);
    }

    private createHighTierMergeCore(
        content: Node,
        index: number,
        value: number,
        x: number,
        y: number,
        tileSize: number,
        material: TileMaterial,
        tier: number,
    ): void {
        const core = this.createNode(content, `MergeCore-${index}-${value}`, x, y, tileSize, tileSize);
        core.setSiblingIndex(content.children.length - 1);
        const opacity = core.addComponent(UIOpacity);
        opacity.opacity = 220;
        const graphics = core.addComponent(Graphics);
        const radius = tileSize * (0.2 + tier * 0.025);
        graphics.fillColor = colorWithAlpha(material.core, 104 + tier * 28);
        graphics.moveTo(0, -radius);
        graphics.lineTo(radius, 0);
        graphics.lineTo(0, radius);
        graphics.lineTo(-radius, 0);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(material.accent, 220);
        graphics.lineWidth = 2 + tier;
        graphics.stroke();
        core.setScale(0.45, 0.45, 1);
        tween(core)
            .to(0.16 + tier * 0.035, {
                scale: new Vec3(1.15 + tier * 0.08, 1.15 + tier * 0.08, 1),
            }, { easing: 'backOut' })
            .start();
        tween(opacity)
            .to(0.2 + tier * 0.035, { opacity: 0 })
            .call(() => this.destroyNodeWithTweens(core))
            .start();
    }

    private drawTile(tile: Node, value: number, size: number): void {
        const rgb: Rgb = TILE_COLORS[value] ?? [214, 112, 188];
        const material = TILE_MATERIALS[value];
        const tier = HIGH_TIER_LEVELS[value] ?? 0;
        const neonLevel = value >= 512 ? Math.min(3, Math.log2(value) - 8) : 0;
        const base = [10, 21, 38] as const;
        const fill = rgb.map((channel, index) => Math.round(base[index] + channel * 0.38));
        const graphics = tile.addComponent(Graphics);
        for (let layer = neonLevel + 1; layer >= 1 && neonLevel > 0; layer -= 1) {
            const expansion = 7 + layer * 5;
            graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 10 + neonLevel * 7);
            graphics.roundRect(
                -size / 2 - expansion,
                -size / 2 - expansion,
                size + expansion * 2,
                size + expansion * 2,
                27 + layer * 2,
            );
            graphics.fill();
        }
        graphics.fillColor = new Color(0, 0, 0, 70);
        graphics.roundRect(-size / 2 - 2, -size / 2 - 7, size + 4, size + 4, 23);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 24);
        graphics.roundRect(-size / 2 - 7, -size / 2 - 7, size + 14, size + 14, 26);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 42);
        graphics.roundRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8, 24);
        graphics.fill();
        graphics.fillColor = new Color(fill[0], fill[1], fill[2], 218);
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], value >= 2048 ? 248 : 228);
        graphics.lineWidth = value >= 2048 ? 3 : 2;
        graphics.roundRect(-size / 2, -size / 2, size, size, 20);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 58);
        graphics.lineWidth = 1;
        graphics.roundRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10, 16);
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 162);
        graphics.moveTo(-size / 2 + 18, size / 2 - 9);
        graphics.lineTo(size / 2 - 18, size / 2 - 9);
        graphics.stroke();
        if (material) this.drawHighTierTileMaterial(graphics, size, material, tier);
        if (neonLevel > 0) this.createPersistentTileGlow(tile, value, size, rgb, neonLevel, material);
        const digits = value.toString().length;
        const fontSize = digits <= 2 ? 52 : digits === 3 ? 46 : digits === 4 ? 38 : 31;
        const color = new Color(
            Math.round(COLORS.white.r * 0.88 + rgb[0] * 0.12),
            Math.round(COLORS.white.g * 0.88 + rgb[1] * 0.12),
            Math.round(COLORS.white.b * 0.88 + rgb[2] * 0.12),
            255,
        );
        const label = this.createLabel(tile, 'Value', String(value), 0, 2, fontSize, color, size - 12, size - 12);
        label.isBold = true;
    }

    private drawHighTierTileMaterial(
        graphics: Graphics,
        size: number,
        material: TileMaterial,
        tier: number,
    ): void {
        const outerRect = calculateHighTierTileRect(size, -1);
        const safeSize = outerRect.size + outerRect.inset * 2;
        const half = safeSize / 2;
        // 多层不透明/半透明内嵌面，形成实体深度和逐级增加的结构层。
        graphics.fillColor = colorWithAlpha(material.surface, 238);
        graphics.roundRect(
            -half + outerRect.inset,
            -half + outerRect.inset,
            outerRect.size,
            outerRect.size,
            outerRect.radius,
        );
        graphics.fill();
        for (let layer = 0; layer < material.layerCount; layer += 1) {
            const rect = calculateHighTierTileRect(safeSize, layer);
            const alpha = 154 - layer * 17;
            graphics.fillColor = colorWithAlpha(layer % 2 === 0 ? material.body : material.facet, alpha);
            graphics.roundRect(-half + rect.inset, -half + rect.inset, rect.size, rect.size, rect.radius);
            graphics.fill();
            graphics.strokeColor = colorWithAlpha(material.accent, 70 + tier * 20 - layer * 8);
            graphics.lineWidth = 1.2 + tier * 0.35;
            graphics.roundRect(-half + rect.inset, -half + rect.inset, rect.size, rect.size, rect.radius);
            graphics.stroke();
        }

        const facet = safeSize * (0.28 + tier * 0.018);
        graphics.fillColor = colorWithAlpha(material.facet, 74 + tier * 15);
        graphics.moveTo(0, -facet);
        graphics.lineTo(facet, 0);
        graphics.lineTo(0, facet);
        graphics.lineTo(-facet, 0);
        graphics.close();
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(material.core, 146 + tier * 20);
        graphics.lineWidth = 1.5 + tier * 0.4;
        graphics.stroke();

        const core = safeSize * (0.12 + tier * 0.012);
        graphics.fillColor = colorWithAlpha(material.core, 82 + tier * 22);
        graphics.roundRect(-core, -core * 0.62, core * 2, core * 1.24, 7 + tier);
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(material.accent, 190);
        graphics.lineWidth = 1.5 + tier * 0.25;
        graphics.roundRect(-core, -core * 0.62, core * 2, core * 1.24, 7 + tier);
        graphics.stroke();

        // 4096 额外加入紫电折线和冰蓝切面；2048 保留熔金扫描，1024 使用等离子晶面。
        const scanOffset = safeSize * (0.27 + tier * 0.02);
        graphics.strokeColor = colorWithAlpha(material.accent, 112 + tier * 22);
        graphics.lineWidth = 1.5 + tier * 0.3;
        graphics.moveTo(-scanOffset, -safeSize * 0.32);
        graphics.lineTo(-scanOffset * 0.42, safeSize * 0.18);
        graphics.lineTo(scanOffset * 0.08, -safeSize * 0.02);
        graphics.lineTo(scanOffset, safeSize * 0.32);
        graphics.stroke();
        if (material.signature === 'ultimate') {
            graphics.strokeColor = colorWithAlpha(material.facet, 224);
            graphics.lineWidth = 2.5;
            graphics.moveTo(-safeSize * 0.34, safeSize * 0.22);
            graphics.lineTo(-safeSize * 0.1, safeSize * 0.04);
            graphics.lineTo(safeSize * 0.02, safeSize * 0.22);
            graphics.lineTo(safeSize * 0.3, -safeSize * 0.24);
            graphics.stroke();
            graphics.strokeColor = colorWithAlpha(material.core, 218);
            graphics.lineWidth = 1.5;
            graphics.moveTo(-safeSize * 0.28, -safeSize * 0.22);
            graphics.lineTo(safeSize * 0.3, safeSize * 0.22);
            graphics.stroke();
        }
    }

    private createPersistentTileGlow(
        tile: Node,
        value: number,
        size: number,
        rgb: Rgb,
        level: number,
        material?: TileMaterial,
    ): void {
        const glow = this.createNode(tile, `EliteGlow-${value}`, 0, 0, size, size);
        const opacity = glow.addComponent(UIOpacity);
        const tier = HIGH_TIER_LEVELS[value] ?? 0;
        const glowRgb = material?.glow ?? rgb;
        opacity.opacity = Math.min(255, 115 + level * 28 + tier * 12);
        const graphics = glow.addComponent(Graphics);
        const ringCount = material?.layerCount ?? level + 1;
        for (let ring = 0; ring < ringCount; ring += 1) {
            const inset = 2 + ring * 4;
            graphics.strokeColor = colorWithAlpha(ring % 2 === 0 ? glowRgb : (material?.accent ?? rgb), 205 - ring * 32);
            graphics.lineWidth = Math.max(1.5, 4.5 - ring * 0.55 + level * 0.8 + tier * 0.5);
            graphics.roundRect(
                -size / 2 - inset,
                -size / 2 - inset,
                size + inset * 2,
                size + inset * 2,
                22 + ring * 2,
            );
            graphics.stroke();
        }
        if (material) {
            const core = this.createNode(tile, `EnergyCore-${value}`, 0, 0, size * 0.72, size * 0.72);
            const coreOpacity = core.addComponent(UIOpacity);
            coreOpacity.opacity = 120 + tier * 28;
            const coreGraphics = core.addComponent(Graphics);
            const radius = size * (0.19 + tier * 0.018);
            coreGraphics.fillColor = colorWithAlpha(material.core, 86 + tier * 20);
            coreGraphics.circle(0, 0, radius);
            coreGraphics.fill();
            coreGraphics.strokeColor = colorWithAlpha(material.accent, 186 + tier * 18);
            coreGraphics.lineWidth = 1.5 + tier * 0.4;
            coreGraphics.circle(0, 0, radius * 1.26);
            coreGraphics.stroke();

            const scan = this.createNode(tile, `MaterialScan-${value}`, 0, 0, size, size);
            const scanGraphics = scan.addComponent(Graphics);
            scanGraphics.strokeColor = colorWithAlpha(material.accent, 96 + tier * 25);
            scanGraphics.lineWidth = 1.5 + tier * 0.25;
            scanGraphics.moveTo(-size * 0.34, -size * 0.16);
            scanGraphics.lineTo(size * 0.34, size * 0.16);
            scanGraphics.moveTo(-size * 0.34, size * 0.16);
            scanGraphics.lineTo(size * 0.34, -size * 0.16);
            scanGraphics.stroke();
            if (material.signature === 'ultimate') {
                scanGraphics.strokeColor = colorWithAlpha(material.facet, 186);
                scanGraphics.lineWidth = 2;
                scanGraphics.moveTo(-size * 0.4, 0);
                scanGraphics.lineTo(size * 0.4, 0);
                scanGraphics.stroke();
            }
            tween(scan)
                .repeatForever(
                    tween().by(0.85 - tier * 0.08, { angle: 360 }, { easing: 'linear' }),
                )
                .start();
            tween(core)
                .repeatForever(
                    tween()
                        .to(material.pulse, { scale: new Vec3(1.08 + tier * 0.035, 1.08 + tier * 0.035, 1) }, { easing: 'sineInOut' })
                        .to(material.pulse, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' }),
                )
                .start();
            tween(coreOpacity)
                .repeatForever(
                    tween()
                        .to(material.pulse, { opacity: Math.min(255, 165 + tier * 25) }, { easing: 'sineInOut' })
                        .to(material.pulse, { opacity: 120 + tier * 28 }, { easing: 'sineInOut' }),
                )
                .start();
        }
        const pulseScale = 1.035 + level * 0.018 + tier * 0.012;
        const pulseDuration = material?.pulse ?? (0.42 - level * 0.04);
        tween(glow)
            .repeatForever(
                tween()
                    .to(pulseDuration, { scale: new Vec3(pulseScale, pulseScale, 1) }, { easing: 'sineInOut' })
                    .to(pulseDuration, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        tween(opacity)
            .repeatForever(
                tween()
                    .to(pulseDuration, { opacity: Math.min(255, 175 + level * 25 + tier * 16) }, { easing: 'sineInOut' })
                    .to(pulseDuration, { opacity: Math.min(255, 115 + level * 28 + tier * 12) }, { easing: 'sineInOut' }),
            )
            .start();
    }

    private updateDangerState(gameOver = false): void {
        const emptyCount = this.model.board.reduce((count, value) => count + (value === 0 ? 1 : 0), 0);
        const shouldEnter = !gameOver && this.state === 'playing' && emptyCount <= 2;
        this.setDangerMode(shouldEnter, true, emptyCount);
    }

    private setDangerMode(enabled: boolean, restoreMusic: boolean, emptyCount = 0): void {
        if (enabled === this.dangerMode) {
            if (enabled) this.updateDangerHint(emptyCount);
            return;
        }
        this.dangerMode = enabled;
        if (enabled) {
            this.createDangerLayer(emptyCount);
            if (this.dangerMusicClip) this.context?.services.audio.playMusic(this.dangerMusicClip);
            return;
        }
        this.destroyDangerLayer();
        this.updateDangerHint();
        if (restoreMusic && this.normalMusicClip) this.context?.services.audio.playMusic(this.normalMusicClip);
    }

    private createDangerLayer(emptyCount: number): void {
        this.destroyDangerLayer();
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const root = this.createNode(this.node, 'CriticalSpaceEffect', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        this.dangerLayer = root;
        const opacity = root.addComponent(UIOpacity);
        opacity.opacity = 125;
        const graphics = root.addComponent(Graphics);
        [18, 10, 4].forEach((lineWidth, index) => {
            graphics.strokeColor = new Color(255, index === 2 ? 65 : 26, index === 0 ? 128 : 218, 38 + index * 35);
            graphics.lineWidth = lineWidth;
            const inset = 10 + index * 7;
            graphics.roundRect(-width / 2 + inset, -height / 2 + inset, width - inset * 2, height - inset * 2, 34);
            graphics.stroke();
        });
        graphics.fillColor = new Color(255, 28, 112, 28);
        graphics.rect(-width / 2, height / 2 - 82, width, 82);
        graphics.rect(-width / 2, -height / 2, width, 82);
        graphics.fill();
        const cornerLength = 92;
        graphics.strokeColor = new Color(255, 83, 177, 210);
        graphics.lineWidth = 4;
        [-1, 1].forEach((horizontal) => [-1, 1].forEach((vertical) => {
            const x = horizontal * (width / 2 - 35);
            const y = vertical * (height / 2 - 35);
            graphics.moveTo(x, y - vertical * cornerLength);
            graphics.lineTo(x, y);
            graphics.lineTo(x - horizontal * cornerLength, y);
        }));
        graphics.stroke();

        const scan = this.createNode(root, 'CriticalScanLine', 0, height / 2 - 130, width - 42, 6);
        const scanGraphics = scan.addComponent(Graphics);
        scanGraphics.fillColor = new Color(255, 46, 143, 62);
        scanGraphics.rect(-(width - 42) / 2, -3, width - 42, 6);
        scanGraphics.fill();
        tween(scan)
            .repeatForever(
                tween()
                    .to(1.25, { position: new Vec3(0, -height / 2 + 130, 0) }, { easing: 'quadIn' })
                    .call(() => scan.setPosition(0, height / 2 - 130)),
            )
            .start();
        tween(opacity)
            .repeatForever(
                tween()
                    .to(0.36, { opacity: 230 }, { easing: 'sineInOut' })
                    .to(0.36, { opacity: 118 }, { easing: 'sineInOut' }),
            )
            .start();
        this.updateDangerHint(emptyCount);
    }

    private destroyDangerLayer(): void {
        if (!this.dangerLayer) return;
        const opacity = this.dangerLayer.getComponent(UIOpacity);
        const scan = this.dangerLayer.getChildByName('CriticalScanLine');
        Tween.stopAllByTarget(this.dangerLayer);
        if (opacity) Tween.stopAllByTarget(opacity);
        if (scan) Tween.stopAllByTarget(scan);
        if (this.dangerLayer.isValid) this.destroyNodeWithTweens(this.dangerLayer);
        this.dangerLayer = undefined;
    }

    private updateDangerHint(emptyCount?: number): void {
        const hint = this.node.getChildByName('Hint')?.getComponent(Label);
        if (!hint) return;
        if (emptyCount !== undefined && emptyCount <= 2) {
            hint.string = `空间临界 · 仅剩 ${emptyCount} 格`;
            hint.color = new Color(255, 126, 184, 255);
            hint.isBold = true;
        } else {
            hint.string = '';
            hint.color = COLORS.muted;
            hint.isBold = false;
        }
    }

    private refreshHud(): void {
        if (this.scoreLabel) this.scoreLabel.string = String(this.model.score);
        if (this.bestLabel) this.bestLabel.string = String(Math.max(this.bestScore, this.model.score));
    }

    private dismissResultOverlay(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
        this.setPauseButtonLabel('结算');
    }

    private setPauseButtonLabel(text: string): void {
        const label = this.pauseButton?.node.getChildByName('Label')?.getComponent(Label);
        if (label) label.string = text;
    }

    private createHudCard(x: number, y: number, caption: string, accent: Color, scale = 1): Label {
        const card = this.createNode(this.node, `${caption}Card`, x, y, 188, 92);
        card.setScale(scale, scale, 1);
        const graphics = card.addComponent(Graphics);
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 14);
        graphics.roundRect(-99, -51, 198, 102, 22);
        graphics.fill();
        graphics.fillColor = COLORS.panelLight;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 155);
        graphics.lineWidth = 2;
        graphics.roundRect(-94, -46, 188, 92, 18);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 48);
        graphics.lineWidth = 1;
        graphics.roundRect(-88, -40, 176, 80, 14);
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 100);
        graphics.moveTo(-55, 39);
        graphics.lineTo(55, 39);
        graphics.stroke();
        this.createLabel(card, 'Caption', caption, 0, 24, 17, accent, 150, 28).spacingX = 2;
        const value = this.createLabel(card, 'Value', '0', 0, -12, 30, COLORS.white, 160, 46);
        value.isBold = true;
        return value;
    }

    /** 4096 首次达成是本局最终庆祝时刻，使用独立庆祝层而不是通用系统弹窗。 */
    private buildTargetOverlay(actions: readonly OverlayAction[]): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, 'Game2048TargetOverlay', 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);

        const shade = root.addComponent(Graphics);
        shade.fillColor = new Color(2, 5, 14, 232);
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        const panelWidth = Math.max(200, Math.min(548, layout.contentWidth - 32));
        const panelHeight = Math.max(360, Math.min(700, height - layout.safeTop - layout.safeBottom - 64));
        const panel = this.createNode(
            root,
            'AchievementPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        const targetMaterial = TILE_MATERIALS[4096];

        // 4096 使用紫电、熔金与冰蓝高光组成独立的终极材质庆祝层。
        graphics.fillColor = colorWithAlpha(targetMaterial.glow, 18);
        graphics.roundRect(-panelWidth / 2 - 14, -panelHeight / 2 - 14, panelWidth + 28, panelHeight + 28, 44);
        graphics.fill();
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 62);
        graphics.lineWidth = 14;
        graphics.roundRect(-panelWidth / 2 - 7, -panelHeight / 2 - 7, panelWidth + 14, panelHeight + 14, 38);
        graphics.stroke();
        graphics.fillColor = new Color(14, 25, 48, 250);
        graphics.strokeColor = colorWithAlpha(targetMaterial.facet, 232);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 32);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = colorWithAlpha(targetMaterial.accent, 92);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 25);
        graphics.stroke();

        const halo = this.createNode(panel, 'Target4096Halo', 0, 184, 390, 300);
        const haloGraphics = halo.addComponent(Graphics);
        [142, 122, 101, 82].forEach((radius, index) => {
            haloGraphics.strokeColor = colorWithAlpha(
                index % 2 === 0 ? targetMaterial.glow : targetMaterial.accent,
                52 + index * 18,
            );
            haloGraphics.lineWidth = 3 + index * 0.7;
            haloGraphics.circle(0, 0, radius);
            haloGraphics.stroke();
        });
        haloGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 176);
        haloGraphics.lineWidth = 2;
        for (let index = 0; index < 12; index += 1) {
            const angle = (Math.PI * 2 * index) / 12;
            haloGraphics.moveTo(Math.cos(angle) * 112, Math.sin(angle) * 112);
            haloGraphics.lineTo(Math.cos(angle) * 154, Math.sin(angle) * 154);
        }
        haloGraphics.stroke();
        halo.setScale(0.78, 0.78, 1);
        tween(halo)
            .repeatForever(
                tween()
                    .to(0.8, { scale: new Vec3(1.05, 1.05, 1) }, { easing: 'sineInOut' })
                    .to(0.8, { scale: new Vec3(0.86, 0.86, 1) }, { easing: 'sineInOut' }),
            )
            .start();

        const crystalCore = this.createNode(panel, 'Target4096CrystalCore', 0, 184, 192, 192);
        const crystalOpacity = crystalCore.addComponent(UIOpacity);
        crystalOpacity.opacity = 210;
        const crystalGraphics = crystalCore.addComponent(Graphics);
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.core, 84);
        crystalGraphics.moveTo(0, -70);
        crystalGraphics.lineTo(70, 0);
        crystalGraphics.lineTo(0, 70);
        crystalGraphics.lineTo(-70, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        crystalGraphics.strokeColor = colorWithAlpha(targetMaterial.accent, 210);
        crystalGraphics.lineWidth = 3;
        crystalGraphics.stroke();
        crystalGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 112);
        crystalGraphics.moveTo(0, -49);
        crystalGraphics.lineTo(49, 0);
        crystalGraphics.lineTo(0, 49);
        crystalGraphics.lineTo(-49, 0);
        crystalGraphics.close();
        crystalGraphics.fill();
        tween(crystalCore)
            .repeatForever(
                tween()
                    .to(0.52, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
                    .to(0.52, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'sineInOut' }),
            )
            .start();
        tween(crystalOpacity)
            .repeatForever(
                tween()
                    .to(0.52, { opacity: 255 }, { easing: 'sineInOut' })
                    .to(0.52, { opacity: 168 }, { easing: 'sineInOut' }),
            )
            .start();

        const burst = this.createNode(panel, 'AchievementBurst', 0, 184, 340, 260);
        const burstGraphics = burst.addComponent(Graphics);
        for (let index = 0; index < 20; index += 1) {
            const angle = (Math.PI * 2 * index) / 20;
            const inner = index % 2 === 0 ? 88 : 98;
            const outer = index % 2 === 0 ? 125 : 116;
            burstGraphics.strokeColor = index % 3 === 0
                ? colorWithAlpha(targetMaterial.accent, 112)
                : colorWithAlpha(targetMaterial.facet, 138);
            burstGraphics.lineWidth = index % 2 === 0 ? 3 : 2;
            burstGraphics.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            burstGraphics.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
            burstGraphics.stroke();
        }
        burstGraphics.strokeColor = colorWithAlpha(targetMaterial.glow, 92);
        burstGraphics.lineWidth = 2;
        burstGraphics.circle(0, 0, 108);
        burstGraphics.stroke();

        const badge = this.createNode(panel, 'Unlocked4096Tile', 0, 184, 142, 142);
        this.drawTile(badge, 4096, 142);

        const sparkColors = [
            colorWithAlpha(targetMaterial.facet, 255),
            colorWithAlpha(targetMaterial.accent, 255),
            colorWithAlpha(targetMaterial.glow, 255),
        ] as const;
        const sparkPositions = [
            [-174, 240], [-142, 128], [162, 245], [182, 142], [-211, 188], [214, 198],
        ] as const;
        sparkPositions.forEach(([x, y], index) => {
            const spark = this.createNode(panel, `CelebrationSpark-${index}`, x, y, 16, 16);
            const opacity = spark.addComponent(UIOpacity);
            const sparkGraphics = spark.addComponent(Graphics);
            const color = sparkColors[index % sparkColors.length];
            sparkGraphics.fillColor = new Color(color.r, color.g, color.b, 230);
            if (index % 2 === 0) {
                sparkGraphics.moveTo(0, 8);
                sparkGraphics.lineTo(3, 3);
                sparkGraphics.lineTo(8, 0);
                sparkGraphics.lineTo(3, -3);
                sparkGraphics.lineTo(0, -8);
                sparkGraphics.lineTo(-3, -3);
                sparkGraphics.lineTo(-8, 0);
                sparkGraphics.lineTo(-3, 3);
                sparkGraphics.close();
                sparkGraphics.fill();
            } else {
                sparkGraphics.circle(0, 0, 4);
                sparkGraphics.fill();
            }
            spark.setScale(0.35, 0.35, 1);
            tween(spark)
                .delay(0.08 + index * 0.035)
                .to(0.28, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
                .to(0.18, { scale: new Vec3(0.9, 0.9, 1) }, { easing: 'sineInOut' })
                .start();
            tween(opacity)
                .repeatForever(
                    tween()
                        .to(0.62 + index * 0.04, { opacity: 115 }, { easing: 'sineInOut' })
                        .to(0.62 + index * 0.04, { opacity: 255 }, { easing: 'sineInOut' }),
                )
                .start();
        });

        const kicker = this.createLabel(
            panel, 'AchievementKicker', 'ACHIEVEMENT  //  4096', 0, panelHeight / 2 - 34,
            14, colorWithAlpha(targetMaterial.accent, 255), panelWidth - 72, 24,
        );
        kicker.spacingX = 3;

        const title = this.createLabel(panel, 'Title', '恭喜你！', 0, 80, 42, COLORS.white, panelWidth - 64, 58);
        title.isBold = true;
        const subtitle = this.createLabel(
            panel, 'Subtitle', '成功点亮 4096', 0, 31, 24, colorWithAlpha(targetMaterial.facet, 255), panelWidth - 72, 40,
        );
        subtitle.isBold = true;

        const scoreChip = this.createNode(panel, 'AchievementScore', 0, -24, panelWidth - 112, 54);
        const scoreGraphics = scoreChip.addComponent(Graphics);
        scoreGraphics.fillColor = colorWithAlpha(targetMaterial.facet, 16);
        scoreGraphics.strokeColor = colorWithAlpha(targetMaterial.facet, 104);
        scoreGraphics.lineWidth = 1.5;
        scoreGraphics.roundRect(-(panelWidth - 112) / 2, -27, panelWidth - 112, 54, 15);
        scoreGraphics.fill();
        scoreGraphics.stroke();
        const score = this.createLabel(
            scoreChip, 'Score', `本局得分  ${this.model.score}`, 0, 0, 22, COLORS.white, panelWidth - 136, 42,
        );
        score.isBold = true;

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildTargetOverlay(actions),
            busy: false,
        };
        const buttonWidth = Math.min(390, panelWidth - 64);
        const buttonStartY = -102;
        actions.forEach((action, index) => {
            const button = this.createButton(
                panel, action.name, action.label, 0, buttonStartY - index * 75,
                buttonWidth, 58, action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });

        burst.setScale(0.55, 0.55, 1);
        tween(burst).to(0.5, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        panel.setScale(0.82, 0.76, 1);
        tween(panel).to(0.28, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private buildOverlay(name: string, title: string, body: string, actions: readonly OverlayAction[]): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const layout = this.layoutMetrics ?? this.readLayoutMetrics();
        const root = this.createNode(this.node, name, 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = COLORS.overlay;
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        const panelHeight = Math.max(
            360,
            Math.min(
                actions.length === 2 ? 500 : 590,
                height - layout.safeTop - layout.safeBottom - 64,
            ),
        );
        const panelWidth = Math.max(200, Math.min(520, layout.contentWidth - 64));
        const panel = this.createNode(
            root,
            'NeonPanel',
            layout.contentX,
            (layout.safeBottom - layout.safeTop) / 2,
            panelWidth,
            panelHeight,
        );
        const graphics = panel.addComponent(Graphics);
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 28);
        graphics.lineWidth = 16;
        graphics.roundRect(-panelWidth / 2 - 8, -panelHeight / 2 - 8, panelWidth + 16, panelHeight + 16, 38);
        graphics.stroke();
        graphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 16);
        graphics.roundRect(-panelWidth / 2 - 10, -panelHeight / 2 - 10, panelWidth + 20, panelHeight + 20, 34);
        graphics.fill();
        graphics.fillColor = COLORS.panel;
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 188);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 30);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 62);
        graphics.lineWidth = 1;
        graphics.roundRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth - 16, panelHeight - 16, 24);
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 112);
        graphics.moveTo(-72, panelHeight / 2 - 78);
        graphics.lineTo(72, panelHeight / 2 - 78);
        graphics.stroke();
        this.createLabel(panel, 'Kicker', 'SYSTEM // 2048', 0, panelHeight / 2 - 55, 15, COLORS.cyan, panelWidth - 70, 26).spacingX = 3;
        const titleLabel = this.createLabel(panel, 'Title', title, 0, panelHeight / 2 - 120, 40, COLORS.white, panelWidth - 70, 58);
        titleLabel.isBold = true;
        this.createLabel(panel, 'Body', body, 0, panelHeight / 2 - 210, 24, COLORS.muted, panelWidth - 80, 90);

        const state: OverlayState = {
            root,
            buttons: [],
            rebuild: () => this.buildOverlay(name, title, body, actions),
            busy: false,
        };
        const startY = actions.length === 2 ? -70 : -62;
        const buttonWidth = Math.min(360, panelWidth - 64);
        actions.forEach((action, index) => {
            const button = this.createButton(
                panel,
                action.name,
                action.label,
                0,
                startY - index * 84,
                buttonWidth,
                62,
                action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });
        panel.setScale(0.86, 0.78, 1);
        tween(panel).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 140;
        });
        try {
            await action.action();
        } catch (error: unknown) {
            console.error(`[Game2048Game] ${action.name} failed.`, error);
            if (state.root.isValid) {
                state.busy = false;
                state.buttons.forEach((button) => {
                    button.interactable = true;
                    const opacity = button.node.getComponent(UIOpacity);
                    if (opacity) opacity.opacity = 255;
                });
            }
        }
    }

    private createButton(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        tone: 'cyan' | 'amber' | 'dark',
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        const accent = tone === 'cyan' ? COLORS.cyan
            : tone === 'amber' ? COLORS.amber
                : new Color(91, 157, 177, 255);
        const fill = tone === 'dark' ? COLORS.panelLight : new Color(
            Math.round(COLORS.panel.r * 0.68 + accent.r * 0.32),
            Math.round(COLORS.panel.g * 0.68 + accent.g * 0.32),
            Math.round(COLORS.panel.b * 0.68 + accent.b * 0.32),
            255,
        );
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 9 : 16);
        graphics.roundRect(-width / 2 - 5, -height / 2 - 5, width + 10, height + 10, 19);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, tone === 'dark' ? 130 : 188);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -height / 2, width, height, 15);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 58);
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 5, -height / 2 + 5, width - 10, height - 10, 11);
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 112);
        graphics.moveTo(-width / 2 + 22, height / 2 - 7);
        graphics.lineTo(width / 2 - 22, height / 2 - 7);
        graphics.stroke();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.08;
        const label = this.createLabel(node, 'Label', text, 0, 0, height <= 58 ? 20 : 24,
            COLORS.white, width - 20, height - 8);
        label.isBold = true;
        return button;
    }

    private createNode(parent: Node, name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y);
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private createLabel(
        parent: Node,
        name: string,
        text: string,
        x: number,
        y: number,
        fontSize: number,
        color: Color,
        width: number,
        height: number,
    ): Label {
        const node = this.createNode(parent, name, x, y, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 9;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private tilePosition(index: number, boardSize: number, gap: number, tileSize: number): { x: number; y: number } {
        const row = Math.floor(index / BOARD_SIZE);
        const column = index % BOARD_SIZE;
        return {
            x: -boardSize / 2 + gap + tileSize / 2 + column * (tileSize + gap),
            y: boardSize / 2 - gap - tileSize / 2 - row * (tileSize + gap),
        };
    }

    private destroyOverlay(state?: OverlayState): void {
        if (state?.root.isValid) this.destroyNodeWithTweens(state.root);
    }

    private destroyNodeWithTweens(node: Node): void {
        if (!node.isValid) return;
        Tween.stopAllByTarget(node);
        node.children.slice().forEach((child) => this.destroyNodeWithTweens(child));
        node.getComponents(UIOpacity).forEach((opacity) => Tween.stopAllByTarget(opacity));
        node.destroy();
    }
}
