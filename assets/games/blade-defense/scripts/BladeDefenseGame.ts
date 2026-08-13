import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    Mask,
    Node,
    Sprite,
    SpriteFrame,
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
import type { GameSaveData, StorageService } from '../../../services/storage/StorageService';
import {
    BLADE_DEFENSE_RULES,
    getBladeDefensePetSlotPosition,
} from './BladeDefenseCatalog';
import {
    BladeDefenseModel,
    type BladeDefenseBonusDecision,
    type BladeDefenseBonusOfferSnapshot,
    type BladeDefenseEntitySnapshot,
    type BladeDefenseEvent,
    type BladeDefensePetSnapshot,
} from './BladeDefenseModel';

const { ccclass } = _decorator;

type BladeDefenseGameState =
    | 'idle'
    | 'ready'
    | 'playing'
    | 'bonus'
    | 'paused'
    | 'completed'
    | 'disposed';

export interface BladeDefenseServices {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
}

interface OverlayAction {
    readonly name: string;
    readonly label: string;
    readonly tone: 'teal' | 'gold' | 'coral' | 'dark';
    readonly action: () => void | Promise<void>;
}

interface OverlayState {
    readonly root: Node;
    readonly buttons: Button[];
    busy: boolean;
}

interface DragState {
    readonly touchId: number;
    readonly fromSlot: number;
    x: number;
    y: number;
    targetSlot?: number;
}

const MAX_WAVES = 12;
const FIRST_CHEST_DELAY_SECONDS = 6;

const COLORS = Object.freeze({
    night: new Color(75, 119, 54, 255),
    deep: new Color(81, 119, 58, 255),
    field: new Color(171, 216, 91, 255),
    fieldDark: new Color(111, 169, 65, 255),
    track: new Color(247, 211, 113, 255),
    trackEdge: new Color(137, 95, 48, 255),
    stoneLight: new Color(255, 241, 181, 255),
    cream: new Color(255, 248, 218, 255),
    white: new Color(255, 255, 247, 255),
    muted: new Color(105, 113, 67, 255),
    teal: new Color(92, 194, 234, 255),
    tealDim: new Color(92, 194, 234, 54),
    gold: new Color(255, 191, 62, 255),
    goldDim: new Color(255, 191, 62, 60),
    coral: new Color(255, 116, 104, 255),
    lavender: new Color(166, 118, 220, 255),
    chest: new Color(211, 119, 42, 255),
    ink: new Color(86, 58, 38, 255),
    overlay: new Color(64, 53, 32, 205),
    panel: new Color(255, 247, 211, 252),
});

interface BladeDefenseVisualFrames {
    background?: SpriteFrame;
    board?: SpriteFrame;
    readonly pets: readonly (readonly SpriteFrame[])[];
    readonly enemies: readonly (readonly SpriteFrame[])[];
    readonly weapons: readonly SpriteFrame[];
}

const PET_COLORS: readonly Color[] = Object.freeze([
    new Color(245, 222, 164, 255),
    new Color(119, 201, 211, 255),
    new Color(183, 154, 226, 255),
    new Color(240, 149, 114, 255),
    new Color(112, 190, 134, 255),
    new Color(93, 153, 222, 255),
    new Color(244, 186, 76, 255),
    new Color(241, 111, 167, 255),
]);

@ccclass('BladeDefenseGame')
export class BladeDefenseGame extends Component implements MiniGame {
    private state: BladeDefenseGameState = 'idle';
    private stateBeforePause: 'playing' | 'bonus' = 'playing';
    private context?: MiniGameContext<BladeDefenseServices>;
    private readonly model = new BladeDefenseModel();
    private audioBank?: BundleAudioBank;
    private boardNode?: Node;
    private worldGraphics?: Graphics;
    private scoreLabel?: Label;
    private livesLabel?: Label;
    private waveLabel?: Label;
    private bestLabel?: Label;
    private hintLabel?: Label;
    private detailLabel?: Label;
    private queueLabel?: Label;
    private endpointLabel?: Label;
    private pauseButton?: Button;
    private petLabels: Label[] = [];
    private entityLabels: Label[] = [];
    private petSprites: Sprite[] = [];
    private entitySprites: Sprite[] = [];
    private weaponSprites: Sprite[] = [];
    private visualFrames: BladeDefenseVisualFrames = { pets: [], enemies: [], weapons: [] };
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private bonusOverlay?: OverlayState;
    private bonusTimerLabel?: Label;
    private drag?: DragState;
    private boardSize = 640;
    private trackRadius = 260;
    private bonusRemaining = 0;
    private waveBreakRemaining = 0;
    private firstChestRemaining = FIRST_CHEST_DELAY_SECONDS;
    private firstChestSpawned = false;
    private playCount = 0;
    private bestScore = 0;
    private historicalHighestPet = 1;
    private historicalMaxWave = 0;
    private historicalChestsOpened = 0;
    private roundStartingBest = 0;
    private highestPetThisRound = 1;
    private enemiesDefeated = 0;
    private chestsOpened = 0;
    private bonusesOffered = 0;
    private bonusesWon = 0;
    private lastHitSoundAt = -Infinity;
    private saveWarningShown = false;

    setRandomSourceForTesting(random: () => number): void {
        this.model.setRandomSource(random);
    }

    async initialize(context: MiniGameContext<BladeDefenseServices>): Promise<void> {
        if (this.state !== 'idle') {
            throw new Error(`Cannot initialize BladeDefenseGame from ${this.state}.`);
        }
        this.context = context;
        this.readSave();
        try {
            this.visualFrames = await this.loadVisualFrames();
        } catch (error: unknown) {
            console.error('[BladeDefenseGame] Visual assets failed; using vector fallback.', error);
        }
        this.buildInterface();
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.audioBank = new BundleAudioBank({
            bundle: 'game-blade-defense',
            music: 'visual/audio/bd1-moon-guard-loop-v1',
            cues: {
                uiButton: 'visual/audio/bd1-button-v1',
                drop: 'visual/audio/bd1-button-v1',
                collision: 'visual/audio/bd1-hit-v1',
                fold: 'visual/audio/bd1-chest-v1',
                popup: 'visual/audio/bd1-bonus-v1',
                merge: 'visual/audio/bd1-merge-v1',
                chain: 'visual/audio/bd1-bonus-v1',
                danger: 'visual/audio/bd1-life-v1',
                failure: 'visual/audio/bd1-failure-v1',
                record: 'visual/audio/bd1-record-v1',
            },
        }, context.services.audio, context.services.feedback);
        void this.audioBank.initialize().catch((error: unknown) => {
            console.error('[BladeDefenseGame] Audio initialization failed.', error);
        });
        this.state = 'ready';
    }

    begin(): void {
        if (this.state !== 'ready') {
            throw new Error(`Cannot begin BladeDefenseGame from ${this.state}.`);
        }
        this.startRound();
    }

    protected update(deltaTime: number): void {
        // Keep presentation timers and the deterministic simulation on the
        // same bounded clock. A long background/frame hitch must not skip a
        // chest, wave break or Bonus decision while combat only advances 80ms.
        const step = Math.min(0.08, Math.max(0, deltaTime));
        if (this.state === 'bonus') {
            this.bonusRemaining = Math.max(0, this.bonusRemaining - step);
            if (this.bonusTimerLabel) {
                this.bonusTimerLabel.string = `${Math.ceil(this.bonusRemaining)} 秒后自动稳妥合成`;
            }
            if (this.bonusRemaining <= 0) this.resolveBonus('safe');
            return;
        }
        if (this.state !== 'playing') return;

        if (!this.firstChestSpawned) {
            this.firstChestRemaining -= step;
            if (this.firstChestRemaining <= 0) {
                this.model.spawnChest({
                    progress: 0.01,
                    hp: 2,
                    rewardLevel: 1,
                    wave: Math.max(1, this.model.snapshot.wave.number),
                });
                this.firstChestSpawned = true;
            }
        }

        if (!this.model.snapshot.wave.active) {
            this.waveBreakRemaining = Math.max(0, this.waveBreakRemaining - step);
            if (this.waveBreakRemaining <= 0
                && this.model.snapshot.wave.number < MAX_WAVES) {
                this.model.startNextWave();
            }
        }

        this.model.tick(step);
        this.handleEvents(this.model.drainEvents());
        this.renderWorld();
        this.refreshHud();
    }

    pause(): void {
        if (this.state !== 'playing' && this.state !== 'bonus') return;
        this.stateBeforePause = this.state;
        this.state = 'paused';
        this.drag = undefined;
        this.context?.services.audio.pauseMusic();
        this.renderWorld();
    }

    resume(): void {
        if (this.state !== 'paused') return;
        this.state = this.stateBeforePause;
        this.context?.services.audio.resumeMusic();
        this.renderWorld();
    }

    async restart(): Promise<void> {
        if (this.state === 'disposed') {
            throw new Error('Cannot restart a disposed BladeDefenseGame.');
        }
        this.hidePauseMenu();
        this.hideResultView();
        this.destroyOverlay(this.bonusOverlay);
        this.bonusOverlay = undefined;
        this.startRound();
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.state = 'disposed';
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
        view.off('canvas-resize', this.handleCanvasResize, this);
        this.unregisterBoardInput();
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.clearVisualSpriteBindings();
        this.destroyVisualFrames();
        Tween.stopAllByTarget(this.node);
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.bonusOverlay);
        this.node.children.slice().forEach((child) => child.destroy());
        this.context = undefined;
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.hidePauseMenu();
        this.pauseOverlay = this.buildOverlay(
            'BladeDefensePauseOverlay',
            '守卫暂停',
            `所有怪物、宝箱和转刀都已冻结\n当前第 ${Math.max(1, this.model.snapshot.wave.number)} 波`,
            [
                { name: 'ResumeButton', label: '继续守卫', tone: 'teal', action: model.resume },
                { name: 'RestartButton', label: '重新开局', tone: 'gold', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.exit },
            ],
        );
    }

    hidePauseMenu(): void {
        this.destroyOverlay(this.pauseOverlay);
        this.pauseOverlay = undefined;
    }

    showResultView(model: MiniGameResultModel): void {
        this.hideResultView();
        const extra = model.result.extra ?? {};
        const victory = extra.reason === 'victory';
        const wave = typeof extra.wave === 'number' ? extra.wave : this.model.snapshot.wave.number;
        const highest = typeof extra.highestPetLevel === 'number'
            ? extra.highestPetLevel
            : this.highestPetThisRound;
        this.resultOverlay = this.buildOverlay(
            'BladeDefenseResultOverlay',
            victory ? '环岛守住了！' : '爱心门失守',
            `最终分数  ${model.result.score}\n到达波次  ${wave}/${MAX_WAVES} · 最高宠物 Lv.${highest}`,
            [
                { name: 'RestartButton', label: '再守一局', tone: 'gold', action: model.restart },
                { name: 'LobbyButton', label: '返回大厅', tone: 'dark', action: model.returnToLobby },
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
    }

    private startRound(): void {
        this.model.reset();
        this.model.drainEvents();
        this.model.startNextWave();
        this.handleEvents(this.model.drainEvents());
        this.playCount += 1;
        this.roundStartingBest = this.bestScore;
        this.highestPetThisRound = 1;
        this.enemiesDefeated = 0;
        this.chestsOpened = 0;
        this.bonusesOffered = 0;
        this.bonusesWon = 0;
        this.lastHitSoundAt = -Infinity;
        this.firstChestRemaining = FIRST_CHEST_DELAY_SECONDS;
        this.firstChestSpawned = false;
        this.waveBreakRemaining = 0;
        this.bonusRemaining = 0;
        this.drag = undefined;
        this.state = 'playing';
        this.stateBeforePause = 'playing';
        this.context?.reportScore(0);
        this.setHint('拖动萌宠到空塔位；拖到同级萌宠上即可合成');
        this.persistSessionStart();
        this.renderWorld();
        this.refreshHud();
    }

    private handleEvents(events: readonly BladeDefenseEvent[]): void {
        for (const event of events) {
            if (event.type === 'entity-hit') {
                if (event.atSeconds - this.lastHitSoundAt >= 0.09) {
                    this.lastHitSoundAt = event.atSeconds;
                    this.context?.services.feedback.play('collision');
                }
            } else if (event.type === 'entity-spawned' && event.entity.kind === 'chest') {
                this.firstChestSpawned = true;
                this.setHint('发现补给宝箱：转刀也能攻击宝箱，打破后获得新宠物');
            } else if (event.type === 'entity-defeated') {
                if (event.entityKind === 'chest') {
                    this.chestsOpened += 1;
                    this.context?.services.feedback.play('fold');
                } else {
                    this.enemiesDefeated += 1;
                }
                this.context?.reportScore(event.score);
            } else if (event.type === 'life-lost') {
                this.context?.services.feedback.play('danger');
                this.setHint(`有怪物绕完一圈，爱心门损失 ${event.amount} 点生命`);
                this.pulseNode(this.livesLabel?.node);
            } else if (event.type === 'pet-awarded') {
                this.context?.services.feedback.play('fold');
                this.setHint(event.queued
                    ? `塔位已满：Lv.${event.level} 奖励正在等待，合成腾位后自动领取`
                    : `宝箱开启：Lv.${event.level} 新宠物已进入空塔位`);
            } else if (event.type === 'pet-merged') {
                this.highestPetThisRound = Math.max(this.highestPetThisRound, event.resultLevel);
                this.context?.services.feedback.play(event.mode === 'bonus-success' ? 'chain' : 'merge');
                this.setHint(`合成成功：Lv.${event.sourceLevel} → Lv.${event.resultLevel}`);
            } else if (event.type === 'bonus-offered') {
                this.bonusesOffered += 1;
                this.showBonusOffer(event.offer);
            } else if (event.type === 'bonus-resolved') {
                if (event.success && event.decision !== 'safe') {
                    this.bonusesWon += 1;
                    this.context?.services.feedback.play('chain');
                    this.setHint(`Bonus 成功！宠物跃升到 Lv.${event.resultLevel}`);
                } else if (!event.success) {
                    this.context?.services.feedback.play('danger');
                    this.setHint(`挑战失败：只保留一只 Lv.${event.sourceLevel} 宠物`);
                }
            } else if (event.type === 'wave-started') {
                this.setHint(`第 ${event.wave} 波来袭：怪物从巢穴出发，绕一圈后冲击终点`);
            } else if (event.type === 'wave-completed') {
                this.context?.reportScore(event.score);
                if (event.wave >= MAX_WAVES) {
                    this.finishRound('victory');
                } else {
                    this.waveBreakRemaining = 2;
                    this.setHint(`第 ${event.wave} 波守住了，下一波 2 秒后抵达`);
                }
            } else if (event.type === 'game-over') {
                this.finishRound('defeat');
            }
        }
    }

    private finishRound(reason: 'victory' | 'defeat'): void {
        if (this.state === 'completed' || this.state === 'disposed') return;
        const snapshot = this.model.snapshot;
        const newRecord = snapshot.score > this.roundStartingBest;
        this.state = 'completed';
        this.drag = undefined;
        this.bestScore = Math.max(this.bestScore, snapshot.score);
        this.historicalHighestPet = Math.max(this.historicalHighestPet, this.highestPetThisRound);
        this.historicalMaxWave = Math.max(this.historicalMaxWave, snapshot.wave.number);
        this.historicalChestsOpened += this.chestsOpened;
        this.persistFinalResult();
        this.context?.services.feedback.play(newRecord ? 'record' : 'failure');
        this.context?.requestExit(Object.freeze({
            score: snapshot.score,
            duration: snapshot.elapsedSeconds,
            completed: true,
            extra: Object.freeze({
                reason,
                wave: snapshot.wave.number,
                lives: snapshot.lives,
                highestPetLevel: this.highestPetThisRound,
                enemiesDefeated: this.enemiesDefeated,
                chestsOpened: this.chestsOpened,
                bonusesOffered: this.bonusesOffered,
                bonusesWon: this.bonusesWon,
                newRecord,
            }),
        }));
    }

    private readSave(): void {
        const data = this.context?.services.storage.getGameData('blade-defense');
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        const highest = data?.custom?.highestPetLevel;
        const wave = data?.custom?.maxWave;
        const chests = data?.custom?.chestsOpenedTotal;
        this.historicalHighestPet = typeof highest === 'number' && Number.isFinite(highest)
            ? Math.max(1, Math.floor(highest))
            : 1;
        this.historicalMaxWave = typeof wave === 'number' && Number.isFinite(wave)
            ? Math.max(0, Math.floor(wave))
            : 0;
        this.historicalChestsOpened = typeof chests === 'number' && Number.isFinite(chests)
            ? Math.max(0, Math.floor(chests))
            : 0;
    }

    private persistSessionStart(): void {
        this.writeSave({ commitRoundResult: false });
    }

    private persistFinalResult(): void {
        this.writeSave({ commitRoundResult: true });
    }

    private writeSave(options: Readonly<{ commitRoundResult: boolean }>): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const snapshot = this.model.snapshot;
        if (options.commitRoundResult) {
            this.bestScore = Math.max(this.bestScore, snapshot.score);
            this.historicalHighestPet = Math.max(
                this.historicalHighestPet,
                this.highestPetThisRound,
            );
            this.historicalMaxWave = Math.max(
                this.historicalMaxWave,
                snapshot.wave.number,
            );
        }
        const data: GameSaveData = {
            dataVersion: 1,
            playCount: this.playCount,
            highScore: this.bestScore,
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                highestPetLevel: this.historicalHighestPet,
                maxWave: this.historicalMaxWave,
                chestsOpenedTotal: this.historicalChestsOpened,
            }),
        };
        try {
            storage.writeGameData('blade-defense', data);
        } catch (error: unknown) {
            console.error('[BladeDefenseGame] Save failed.', error);
            if (!this.saveWarningShown) {
                this.saveWarningShown = true;
                this.setHint('本次记录暂时无法保存，但当前游戏可以继续');
            }
        }
    }

    private async loadVisualFrames(): Promise<BladeDefenseVisualFrames> {
        const bundle = assetManager.getBundle('game-blade-defense');
        if (!bundle) throw new Error('game-blade-defense bundle is unavailable.');
        const load = (path: string): Promise<SpriteFrame> => new Promise((resolve, reject) => {
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture) {
                    reject(new Error(`Visual texture failed: ${path}. ${error?.message ?? 'Asset missing.'}`));
                    return;
                }
                const frame = new SpriteFrame();
                frame.texture = texture;
                resolve(frame);
            });
        });
        const numberedFrames = (path: string): Promise<SpriteFrame[]> => Promise.all(
            [1, 2, 3, 4].map((frame) => load(`${path}/${String(frame).padStart(2, '0')}/texture`)),
        );
        const [background, board, puppy, kitten, turnip, boar, carrot, fish] = await Promise.all([
            load('visual/backgrounds/bd2-spring-camp-bg-v1/texture'),
            load('visual/boards/bd2-spring-ring-board-v1/texture'),
            numberedFrames('visual/pets/puppy-l1'),
            numberedFrames('visual/pets/kitten-l2'),
            numberedFrames('visual/enemies/turnip-imp'),
            numberedFrames('visual/enemies/acorn-boar'),
            load('visual/weapons/carrot-blade-v1/texture'),
            load('visual/weapons/fish-boomerang-v1/texture'),
        ]);
        return {
            background,
            board,
            pets: [puppy, kitten],
            enemies: [turnip, boar],
            weapons: [carrot, fish],
        };
    }

    private clearVisualSpriteBindings(): void {
        for (const sprite of [...this.petSprites, ...this.entitySprites, ...this.weaponSprites]) {
            sprite.spriteFrame = null;
        }
        for (const sprite of this.node.getComponentsInChildren(Sprite)) {
            sprite.spriteFrame = null;
        }
    }

    private destroyVisualFrames(): void {
        const owned = new Set<SpriteFrame>();
        if (this.visualFrames.background) owned.add(this.visualFrames.background);
        if (this.visualFrames.board) owned.add(this.visualFrames.board);
        this.visualFrames.pets.forEach((frames) => frames.forEach((frame) => owned.add(frame)));
        this.visualFrames.enemies.forEach((frames) => frames.forEach((frame) => owned.add(frame)));
        this.visualFrames.weapons.forEach((frame) => owned.add(frame));
        owned.forEach((frame) => {
            if (frame.isValid) frame.destroy();
        });
        this.visualFrames = { pets: [], enemies: [], weapons: [] };
    }

    private registerBoardInput(): void {
        input.on(Input.EventType.TOUCH_START, this.handleTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.handleTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        input.on(Input.EventType.MOUSE_DOWN, this.handleMouseDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.handleMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.handleMouseUp, this);
    }

    private unregisterBoardInput(): void {
        input.off(Input.EventType.TOUCH_START, this.handleTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.handleTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.handleTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.handleTouchCancel, this);
        input.off(Input.EventType.MOUSE_DOWN, this.handleMouseDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.handleMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.handleMouseUp, this);
    }

    private readonly handleTouchStart = (event: EventTouch): void => {
        this.beginDrag(event, event.getID());
    };

    private readonly handleMouseDown = (event: EventMouse): void => {
        if (event.getButton() !== EventMouse.BUTTON_LEFT) return;
        this.beginDrag(event, -1);
    };

    private beginDrag(event: EventTouch | EventMouse, pointerId: number): void {
        if (this.state !== 'playing' || this.drag) return;
        const point = this.touchPointInBoard(event);
        if (!point) return;
        const slot = this.findNearestSlot(point.x, point.y, this.slotTouchRadius());
        if (slot === undefined || !this.model.snapshot.petSlots[slot]) return;
        this.drag = {
            touchId: pointerId,
            fromSlot: slot,
            x: point.x,
            y: point.y,
        };
        this.setHint('拖到空位可移动；拖到异级宠物可交换；拖到同级宠物可合成');
        this.renderWorld();
    }

    private readonly handleTouchMove = (event: EventTouch): void => {
        const drag = this.drag;
        if (!drag || event.getID() !== drag.touchId || this.state !== 'playing') return;
        const point = this.touchPointInBoard(event);
        if (!point) return;
        drag.x = point.x;
        drag.y = point.y;
        drag.targetSlot = this.findNearestSlot(point.x, point.y, this.slotDropRadius());
        this.renderWorld();
    };

    private readonly handleMouseMove = (event: EventMouse): void => {
        const drag = this.drag;
        if (!drag || drag.touchId !== -1 || this.state !== 'playing') return;
        const point = this.touchPointInBoard(event);
        if (!point) return;
        drag.x = point.x;
        drag.y = point.y;
        drag.targetSlot = this.findNearestSlot(point.x, point.y, this.slotDropRadius());
        this.renderWorld();
    };

    private readonly handleTouchEnd = (event: EventTouch): void => {
        const drag = this.drag;
        if (!drag || event.getID() !== drag.touchId) return;
        const point = this.touchPointInBoard(event);
        if (point) {
            drag.x = point.x;
            drag.y = point.y;
            drag.targetSlot = this.findNearestSlot(point.x, point.y, this.slotDropRadius());
        }
        this.drag = undefined;
        this.applyDrop(drag.fromSlot, drag.targetSlot);
        this.renderWorld();
        this.refreshHud();
    };

    private readonly handleMouseUp = (event: EventMouse): void => {
        const drag = this.drag;
        if (!drag || drag.touchId !== -1) return;
        const point = this.touchPointInBoard(event);
        if (point) {
            drag.x = point.x;
            drag.y = point.y;
            drag.targetSlot = this.findNearestSlot(point.x, point.y, this.slotDropRadius());
        }
        this.drag = undefined;
        this.applyDrop(drag.fromSlot, drag.targetSlot);
        this.renderWorld();
        this.refreshHud();
    };

    private readonly handleTouchCancel = (event: EventTouch): void => {
        if (!this.drag || event.getID() !== this.drag.touchId) return;
        this.drag = undefined;
        this.setHint('已取消拖动，宠物回到原塔位');
        this.renderWorld();
    };

    private applyDrop(fromSlot: number, toSlot?: number): void {
        if (this.state !== 'playing') return;
        if (toSlot === undefined || toSlot === fromSlot) {
            this.setHint('把宠物拖到另一个塔位上');
            this.context?.services.feedback.play('collision');
            return;
        }
        const source = this.model.snapshot.petSlots[fromSlot];
        const target = this.model.snapshot.petSlots[toSlot];
        if (!source) return;

        if (target && target.level === source.level) {
            const result = this.model.mergePets(fromSlot, toSlot);
            this.handleEvents(this.model.drainEvents());
            if (result.outcome === 'rejected') {
                this.context?.services.feedback.play('collision');
                this.setHint(result.reason === 'max-level'
                    ? 'Lv.8 已是最高等级，不能继续合成'
                    : '这两只宠物暂时不能合成');
            }
        } else {
            const result = this.model.movePet(fromSlot, toSlot);
            this.handleEvents(this.model.drainEvents());
            if (result.outcome === 'rejected') {
                this.context?.services.feedback.play('collision');
                this.setHint('该位置暂时不能放置这只宠物');
            } else {
                this.context?.services.feedback.play('drop');
                this.setHint(result.outcome === 'swapped'
                    ? '两只不同等级宠物已交换塔位'
                    : '宠物已移动到新的塔位');
            }
        }

        if (!this.model.snapshot.bonusOffer) {
            const claimed = this.model.claimPendingPets();
            if (claimed.length > 0) this.handleEvents(this.model.drainEvents());
        }
    }

    private showBonusOffer(offer: BladeDefenseBonusOfferSnapshot): void {
        if (this.state !== 'playing') return;
        this.state = 'bonus';
        this.stateBeforePause = 'bonus';
        this.drag = undefined;
        this.bonusRemaining = 8;
        this.context?.services.feedback.play('popup');
        this.destroyOverlay(this.bonusOverlay);

        const actions: OverlayAction[] = [
            {
                name: 'SafeMergeButton',
                label: `稳妥合成 · 100% 到 Lv.${offer.safeTargetLevel}`,
                tone: 'teal',
                action: () => this.resolveBonus('safe'),
            },
            ...offer.choices.map((choice) => ({
                name: `Bonus-${choice.id}`,
                label: `${choice.id === 'plus-2' ? '挑战跃升' : '极限跃升'} · ${Math.round(choice.successChance * 100)}% 到 Lv.${choice.targetLevel}`,
                tone: choice.id === 'plus-2' ? 'gold' as const : 'coral' as const,
                action: () => this.resolveBonus(choice.id),
            })),
        ];
        this.bonusOverlay = this.buildOverlay(
            'BladeDefenseBonusOverlay',
            '合成 Bonus！',
            `两只 Lv.${offer.sourceLevel} 已锁定\n挑战失败只保留目标位的一只 Lv.${offer.sourceLevel}`,
            actions,
        );
        const panel = this.bonusOverlay.root.getChildByName('MoonPanel');
        if (panel) {
            this.bonusTimerLabel = this.createLabel(
                panel,
                'BonusTimer',
                '8 秒后自动稳妥合成',
                0,
                -panel.getComponent(UITransform)!.contentSize.height / 2 + 35,
                18,
                COLORS.muted,
                360,
                30,
            );
        }
    }

    private resolveBonus(decision: BladeDefenseBonusDecision): void {
        if (this.state !== 'bonus') return;
        const result = this.model.resolveBonusOffer(decision);
        if (result.outcome === 'rejected') return;
        this.handleEvents(this.model.drainEvents());
        this.destroyOverlay(this.bonusOverlay);
        this.bonusOverlay = undefined;
        this.bonusTimerLabel = undefined;
        this.bonusRemaining = 0;
        this.state = 'playing';
        this.stateBeforePause = 'playing';
        const claimed = this.model.claimPendingPets();
        if (claimed.length > 0) this.handleEvents(this.model.drainEvents());
        this.renderWorld();
        this.refreshHud();
    }

    private touchPointInBoard(event: EventTouch | EventMouse): Vec3 | undefined {
        const transform = this.boardNode?.getComponent(UITransform);
        if (!transform) return undefined;
        const location = event.getUILocation();
        return transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
    }

    private findNearestSlot(x: number, y: number, radius: number): number | undefined {
        let nearest: number | undefined;
        let nearestDistance = radius * radius;
        for (let index = 0; index < BLADE_DEFENSE_RULES.petSlotCount; index += 1) {
            const position = getBladeDefensePetSlotPosition(index);
            const slotX = position.x * this.trackRadius;
            const slotY = position.y * this.trackRadius;
            const distance = (slotX - x) ** 2 + (slotY - y) ** 2;
            if (distance <= nearestDistance) {
                nearestDistance = distance;
                nearest = index;
            }
        }
        return nearest;
    }

    private slotTouchRadius(): number {
        return Math.max(44, this.boardSize * 0.065);
    }

    private slotDropRadius(): number {
        return Math.max(48, this.boardSize * 0.075);
    }

    private readonly handlePause = (): void => {
        if (this.state !== 'playing' && this.state !== 'bonus') return;
        this.context?.services.feedback.play('uiButton');
        this.context?.requestPause();
    };

    private readonly handleKeyDown = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE
            && (this.state === 'playing' || this.state === 'bonus')) {
            this.handlePause();
        }
    };

    private readonly handleCanvasResize = (): void => {
        if (this.state === 'disposed') return;
        if (this.state === 'paused' || this.state === 'bonus' || this.state === 'completed') {
            return;
        }
        this.buildInterface();
        this.renderWorld();
        this.refreshHud();
    };

    private buildInterface(): void {
        this.unregisterBoardInput();
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        this.node.children.slice().forEach((child) => child.destroy());
        this.petLabels = [];
        this.entityLabels = [];
        this.petSprites = [];
        this.entitySprites = [];
        this.weaponSprites = [];
        this.endpointLabel = undefined;
        this.pauseOverlay = undefined;
        this.resultOverlay = undefined;
        this.bonusOverlay = undefined;
        this.bonusTimerLabel = undefined;

        const visible = view.getVisibleSize();
        const canvasSize = this.node.parent?.getComponent(UITransform)?.contentSize;
        const width = Math.max(1, Math.min(visible.width, canvasSize?.width ?? visible.width));
        const height = Math.max(1, Math.min(visible.height, canvasSize?.height ?? visible.height));
        this.node.getComponent(UITransform)?.setContentSize(width, height);

        const backdrop = this.createNode(this.node, 'SpringCampBackdrop', 0, 0, width, height);
        if (this.visualFrames.background) {
            const sprite = backdrop.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.visualFrames.background;
            backdrop.getComponent(UITransform)?.setContentSize(width, height);
        } else {
            const background = backdrop.addComponent(Graphics);
            background.fillColor = new Color(164, 213, 91, 255);
            background.rect(-width / 2, -height / 2, width, height);
            background.fill();
        }

        const top = height / 2;
        const bottom = -height / 2;
        const title = this.createLabel(
            this.node,
            'Title',
            '萌宠转刀塔防',
            0,
            top - 36,
            Math.max(24, Math.min(34, width * 0.052)),
            COLORS.ink,
            width - 130,
            48,
        );
        title.isBold = true;
        title.spacingX = 2;

        this.pauseButton = this.createButton(
            this.node,
            'PauseButton',
            'Ⅱ',
            width / 2 - 40,
            top - 38,
            56,
            56,
            'dark',
        );
        this.pauseButton.node.on(Button.EventType.CLICK, this.handlePause, this);

        const hudY = top - 96;
        const gap = 7;
        const hudWidth = (width - 28 - gap * 3) / 4;
        const startX = -width / 2 + 14 + hudWidth / 2;
        this.livesLabel = this.createHudCard(startX, hudY, hudWidth, '生命', COLORS.coral);
        this.waveLabel = this.createHudCard(startX + hudWidth + gap, hudY, hudWidth, '波次', COLORS.teal);
        this.scoreLabel = this.createHudCard(startX + (hudWidth + gap) * 2, hudY, hudWidth, '分数', COLORS.gold);
        this.bestLabel = this.createHudCard(startX + (hudWidth + gap) * 3, hudY, hudWidth, '最高', COLORS.lavender);

        const boardTop = top - 140;
        const boardBottom = bottom + 88;
        this.boardSize = Math.max(1, Math.min(width - 24, boardTop - boardBottom, 720));
        const boardY = (boardTop + boardBottom) / 2;
        this.trackRadius = this.boardSize * 0.405;
        this.boardNode = this.createNode(
            this.node,
            'BattleBoard',
            0,
            boardY,
            this.boardSize,
            this.boardSize,
        );
        if (this.visualFrames.board) {
            const maskNode = this.createNode(this.boardNode, 'BoardArtMask', 0, 0, this.boardSize, this.boardSize);
            const mask = maskNode.addComponent(Mask);
            mask.type = Mask.Type.GRAPHICS_ELLIPSE;
            const artNode = this.createNode(maskNode, 'BoardArt', 0, 0, this.boardSize, this.boardSize);
            const art = artNode.addComponent(Sprite);
            art.sizeMode = Sprite.SizeMode.CUSTOM;
            art.spriteFrame = this.visualFrames.board;
            artNode.getComponent(UITransform)?.setContentSize(this.boardSize, this.boardSize);
        }
        const worldLayer = this.createNode(this.boardNode, 'WorldLayer', 0, 0, this.boardSize, this.boardSize);
        this.worldGraphics = worldLayer.addComponent(Graphics);

        for (let index = 0; index < BLADE_DEFENSE_RULES.petSlotCount * 8; index += 1) {
            const node = this.createNode(this.boardNode, `WeaponSprite-${index}`, 0, 0, 42, 42);
            node.active = false;
            node.addComponent(UIOpacity);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.weaponSprites.push(sprite);
        }
        for (let index = 0; index < BLADE_DEFENSE_RULES.petSlotCount; index += 1) {
            const node = this.createNode(this.boardNode, `PetSprite-${index}`, 0, 0, 78, 78);
            node.active = false;
            node.addComponent(UIOpacity);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.petSprites.push(sprite);
        }
        for (let index = 0; index < 40; index += 1) {
            const node = this.createNode(this.boardNode, `EntitySprite-${index}`, 0, 0, 68, 68);
            node.active = false;
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.entitySprites.push(sprite);
        }

        for (let index = 0; index < BLADE_DEFENSE_RULES.petSlotCount; index += 1) {
            const label = this.createLabel(
                this.boardNode,
                `PetLabel-${index}`,
                '',
                0,
                0,
                22,
                COLORS.white,
                66,
                36,
            );
            label.isBold = true;
            label.outlineColor = COLORS.ink;
            label.outlineWidth = 4;
            label.node.active = false;
            this.petLabels.push(label);
        }
        for (let index = 0; index < 40; index += 1) {
            const label = this.createLabel(
                this.boardNode,
                `EntityLabel-${index}`,
                '',
                0,
                0,
                21,
                COLORS.white,
                72,
                34,
            );
            label.isBold = true;
            label.outlineColor = COLORS.ink;
            label.outlineWidth = 4;
            label.node.active = false;
            this.entityLabels.push(label);
        }

        this.endpointLabel = this.createLabel(
            this.boardNode,
            'EndpointLives',
            '10',
            -this.boardSize * 0.06,
            -this.trackRadius + this.boardSize * 0.075,
            24,
            COLORS.white,
            70,
            38,
        );
        this.endpointLabel.isBold = true;
        this.endpointLabel.outlineColor = new Color(135, 62, 44, 255);
        this.endpointLabel.outlineWidth = 5;

        const bottomPanel = this.createNode(this.node, 'CommandPanel', 0, bottom + 42, width - 28, 68);
        const commandGraphics = bottomPanel.addComponent(Graphics);
        commandGraphics.fillColor = new Color(255, 248, 215, 240);
        commandGraphics.strokeColor = new Color(COLORS.ink.r, COLORS.ink.g, COLORS.ink.b, 105);
        commandGraphics.lineWidth = 2;
        commandGraphics.roundRect(-(width - 28) / 2, -34, width - 28, 68, 22);
        commandGraphics.fill();
        commandGraphics.stroke();
        this.hintLabel = this.createLabel(
            bottomPanel,
            'Hint',
            '拖动萌宠换位；拖到同级萌宠上即可合成',
            0,
            10,
            17,
            COLORS.ink,
            width - 60,
            30,
        );
        this.detailLabel = this.createLabel(
            bottomPanel,
            'PetDetails',
            '初始 Lv.1 · 伤害 1 · 1 把转刀',
            0,
            -15,
            13,
            COLORS.muted,
            width - 64,
            24,
        );
        this.queueLabel = undefined;

        this.registerBoardInput();
    }

    private createHudCard(x: number, y: number, width: number, caption: string, accent: Color): Label {
        const card = this.createNode(this.node, `${caption}Card`, x, y, width, 64);
        const graphics = card.addComponent(Graphics);
        graphics.fillColor = new Color(255, 248, 218, 242);
        graphics.strokeColor = new Color(COLORS.ink.r, COLORS.ink.g, COLORS.ink.b, 150);
        graphics.lineWidth = 2;
        graphics.roundRect(-width / 2, -32, width, 64, 18);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 210);
        graphics.circle(-width / 2 + 13, 18, 5);
        graphics.fill();
        this.createLabel(card, 'Caption', caption, 5, 17, 12, accent, width - 20, 20).spacingX = 1;
        const label = this.createLabel(card, 'Value', '0', 0, -10, 21, COLORS.ink, width - 12, 34);
        label.isBold = true;
        return label;
    }

    private renderWorld(): void {
        const graphics = this.worldGraphics;
        const board = this.boardNode;
        if (!graphics || !board) return;
        graphics.clear();
        const snapshot = this.model.snapshot;
        if (!this.visualFrames.board) {
            const half = this.boardSize / 2;
            graphics.fillColor = COLORS.fieldDark;
            graphics.circle(0, 0, half - 3);
            graphics.fill();
            graphics.fillColor = COLORS.field;
            graphics.circle(0, 0, this.trackRadius - 45);
            graphics.fill();
            graphics.strokeColor = COLORS.trackEdge;
            graphics.lineWidth = 72;
            graphics.circle(0, 0, this.trackRadius);
            graphics.stroke();
            graphics.strokeColor = COLORS.track;
            graphics.lineWidth = 58;
            graphics.circle(0, 0, this.trackRadius);
            graphics.stroke();
            this.drawTrackArrows(graphics);
            this.drawNestAndGate(graphics);
        }

        for (let index = 0; index < BLADE_DEFENSE_RULES.petSlotCount; index += 1) {
            const position = getBladeDefensePetSlotPosition(index);
            const x = position.x * this.trackRadius;
            const y = position.y * this.trackRadius;
            const isTarget = this.drag?.targetSlot === index;
            const targetPet = snapshot.petSlots[index];
            const sourcePet = this.drag
                ? snapshot.petSlots[this.drag.fromSlot]
                : undefined;
            const validMerge = !!sourcePet && !!targetPet && sourcePet.level === targetPet.level;
            const validMove = !!sourcePet && (!targetPet || sourcePet.level !== targetPet.level);
            const accent = isTarget
                ? (validMerge ? COLORS.gold : validMove ? COLORS.teal : COLORS.coral)
                : COLORS.teal;
            graphics.fillColor = new Color(accent.r, accent.g, accent.b, isTarget ? 76 : 26);
            graphics.strokeColor = new Color(accent.r, accent.g, accent.b, isTarget ? 235 : 90);
            graphics.lineWidth = isTarget ? 4 : 2;
            graphics.circle(x, y, isTarget ? 35 : 31);
            graphics.fill();
            graphics.stroke();
            if (!targetPet) {
                graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 92);
                graphics.lineWidth = 2;
                graphics.moveTo(x - 8, y);
                graphics.lineTo(x + 8, y);
                graphics.moveTo(x, y - 8);
                graphics.lineTo(x, y + 8);
                graphics.stroke();
            }
        }

        for (const pet of snapshot.petSlots) {
            if (!pet || this.drag?.fromSlot === pet.slotIndex) continue;
            if (!this.visualFrames.pets[pet.level - 1]) {
                this.drawPet(graphics, pet, pet.x * this.trackRadius, pet.y * this.trackRadius, 255, true);
            }
        }

        snapshot.entities.forEach((entity, index) => {
            if (entity.kind === 'chest' || this.visualFrames.enemies.length === 0) {
                this.drawEntity(graphics, entity);
            }
            const label = this.entityLabels[index];
            if (!label) return;
            label.node.active = true;
            label.string = String(Math.ceil(entity.hp));
            label.color = entity.kind === 'chest' ? COLORS.gold : COLORS.white;
            label.node.setPosition(
                entity.x * this.trackRadius,
                entity.y * this.trackRadius + this.boardSize * 0.065,
            );
        });
        for (let index = snapshot.entities.length; index < this.entityLabels.length; index += 1) {
            this.entityLabels[index].node.active = false;
        }

        snapshot.petSlots.forEach((pet, index) => {
            const label = this.petLabels[index];
            if (!pet) {
                label.node.active = false;
                return;
            }
            label.node.active = true;
            label.string = String(pet.damage);
            label.color = pet.level >= 7 ? COLORS.gold : COLORS.white;
            const dragging = this.drag?.fromSlot === index ? this.drag : undefined;
            label.node.setPosition(
                dragging?.x ?? pet.x * this.trackRadius,
                (dragging?.y ?? pet.y * this.trackRadius) + this.boardSize * 0.065,
            );
        });

        if (this.drag) {
            const pet = snapshot.petSlots[this.drag.fromSlot];
            if (pet && !this.visualFrames.pets[pet.level - 1]) {
                this.drawPet(graphics, pet, this.drag.x, this.drag.y, 220, true);
            }
        }
        this.updateVisualSprites();
        if (this.endpointLabel) this.endpointLabel.string = String(snapshot.lives);
    }

    private updateVisualSprites(): void {
        const snapshot = this.model.snapshot;
        this.petSprites.forEach((sprite) => { sprite.node.active = false; });
        this.entitySprites.forEach((sprite) => { sprite.node.active = false; });
        this.weaponSprites.forEach((sprite) => { sprite.node.active = false; });
        const frameIndex = Math.floor(snapshot.elapsedSeconds * 5) % 4;
        let weaponIndex = 0;

        snapshot.petSlots.forEach((pet, slotIndex) => {
            if (!pet) return;
            const frames = this.visualFrames.pets[pet.level - 1];
            if (!frames?.length) return;
            const sprite = this.petSprites[slotIndex];
            if (!sprite) return;
            const dragging = this.drag?.fromSlot === slotIndex ? this.drag : undefined;
            const x = dragging?.x ?? pet.x * this.trackRadius;
            const y = dragging?.y ?? pet.y * this.trackRadius;
            const size = Math.min(90, Math.max(58, this.boardSize * (pet.level === 1 ? 0.108 : 0.118)));
            sprite.spriteFrame = frames[frameIndex % frames.length];
            sprite.node.active = true;
            sprite.node.setPosition(x, y);
            sprite.node.getComponent(UITransform)?.setContentSize(size, size);
            const opacity = sprite.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = dragging ? 220 : 255;

            const weaponFrame = this.visualFrames.weapons[pet.level - 1];
            if (!weaponFrame) return;
            for (const blade of pet.blades) {
                const weapon = this.weaponSprites[weaponIndex];
                weaponIndex += 1;
                if (!weapon) continue;
                const radius = pet.bladeOrbitRadius * this.trackRadius;
                const bladeSize = Math.min(48, Math.max(30, this.boardSize * 0.055));
                weapon.spriteFrame = weaponFrame;
                weapon.node.active = true;
                weapon.node.setPosition(
                    x + Math.cos(blade.angle) * radius,
                    y + Math.sin(blade.angle) * radius,
                );
                weapon.node.angle = -blade.angle * 180 / Math.PI;
                weapon.node.getComponent(UITransform)?.setContentSize(bladeSize, bladeSize);
                const weaponOpacity = weapon.node.getComponent(UIOpacity);
                if (weaponOpacity) weaponOpacity.opacity = dragging ? 205 : 255;
            }
        });

        snapshot.entities.forEach((entity, index) => {
            if (entity.kind !== 'enemy') return;
            const frames = this.visualFrames.enemies[Math.abs(entity.wave - 1) % this.visualFrames.enemies.length];
            const sprite = this.entitySprites[index];
            if (!frames?.length || !sprite) return;
            const size = Math.min(82, Math.max(54, this.boardSize * (entity.wave % 2 === 0 ? 0.102 : 0.09)));
            sprite.spriteFrame = frames[frameIndex % frames.length];
            sprite.node.active = true;
            sprite.node.setPosition(entity.x * this.trackRadius, entity.y * this.trackRadius);
            sprite.node.getComponent(UITransform)?.setContentSize(size, size);
        });
    }

    private drawTrackArrows(graphics: Graphics): void {
        for (const progress of [0.12, 0.3, 0.48, 0.66, 0.84]) {
            const angle = progress * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * this.trackRadius;
            const y = Math.sin(angle) * this.trackRadius;
            const tangent = angle + Math.PI / 2;
            const length = 17;
            const width = 10;
            graphics.fillColor = new Color(COLORS.cream.r, COLORS.cream.g, COLORS.cream.b, 132);
            graphics.moveTo(x + Math.cos(tangent) * length, y + Math.sin(tangent) * length);
            graphics.lineTo(
                x - Math.cos(tangent) * length + Math.cos(tangent + Math.PI / 2) * width,
                y - Math.sin(tangent) * length + Math.sin(tangent + Math.PI / 2) * width,
            );
            graphics.lineTo(
                x - Math.cos(tangent) * length + Math.cos(tangent - Math.PI / 2) * width,
                y - Math.sin(tangent) * length + Math.sin(tangent - Math.PI / 2) * width,
            );
            graphics.close();
            graphics.fill();
        }
    }

    private drawNestAndGate(graphics: Graphics): void {
        const y = -this.trackRadius;
        const nestX = 34;
        const gateX = -76;

        graphics.fillColor = new Color(50, 35, 67, 255);
        graphics.strokeColor = new Color(COLORS.lavender.r, COLORS.lavender.g, COLORS.lavender.b, 230);
        graphics.lineWidth = 4;
        graphics.circle(nestX, y, 30);
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = new Color(225, 112, 225, 170);
        graphics.circle(nestX, y, 13);
        graphics.fill();
        graphics.strokeColor = new Color(COLORS.lavender.r, COLORS.lavender.g, COLORS.lavender.b, 130);
        graphics.lineWidth = 2;
        graphics.moveTo(nestX + 3, y + 32);
        graphics.lineTo(nestX + 26, y + 43);
        graphics.stroke();

        graphics.fillColor = new Color(235, 197, 101, 255);
        graphics.strokeColor = new Color(111, 64, 38, 255);
        graphics.lineWidth = 4;
        graphics.roundRect(gateX - 30, y - 30, 60, 62, 16);
        graphics.fill();
        graphics.stroke();
        this.drawHeart(graphics, gateX, y, 15, COLORS.coral);
    }

    private drawHeart(graphics: Graphics, x: number, y: number, size: number, color: Color): void {
        graphics.fillColor = color;
        graphics.circle(x - size * 0.36, y + size * 0.2, size * 0.48);
        graphics.circle(x + size * 0.36, y + size * 0.2, size * 0.48);
        graphics.fill();
        graphics.moveTo(x - size * 0.78, y + size * 0.2);
        graphics.lineTo(x + size * 0.78, y + size * 0.2);
        graphics.lineTo(x, y - size);
        graphics.close();
        graphics.fill();
    }

    private drawPet(
        graphics: Graphics,
        pet: BladeDefensePetSnapshot,
        x: number,
        y: number,
        alpha: number,
        drawBlades: boolean,
    ): void {
        const color = PET_COLORS[pet.level - 1] ?? PET_COLORS[0];
        const bodyRadius = 20 + Math.min(5, pet.level * 0.8);
        if (drawBlades) {
            graphics.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, Math.round(alpha * 0.2));
            graphics.lineWidth = pet.level >= 5 ? 2.5 : 1.5;
            graphics.circle(x, y, pet.bladeOrbitRadius * this.trackRadius);
            graphics.stroke();
            for (const blade of pet.blades) {
                const bladeX = x + Math.cos(blade.angle) * pet.bladeOrbitRadius * this.trackRadius;
                const bladeY = y + Math.sin(blade.angle) * pet.bladeOrbitRadius * this.trackRadius;
                this.drawBlade(graphics, bladeX, bladeY, blade.angle + Math.PI / 2, pet.level, alpha);
            }
        }

        graphics.fillColor = new Color(0, 0, 0, Math.round(alpha * 0.24));
        graphics.circle(x, y - 5, bodyRadius + 5);
        graphics.fill();
        graphics.fillColor = new Color(color.r, color.g, color.b, alpha);
        graphics.strokeColor = new Color(255, 248, 222, Math.min(255, alpha));
        graphics.lineWidth = 2.5;
        graphics.circle(x, y, bodyRadius);
        graphics.fill();
        graphics.stroke();

        const earHeight = 11 + pet.level * 0.7;
        graphics.fillColor = new Color(color.r, color.g, color.b, alpha);
        graphics.moveTo(x - bodyRadius * 0.78, y + bodyRadius * 0.5);
        graphics.lineTo(x - bodyRadius * 0.5, y + bodyRadius + earHeight);
        graphics.lineTo(x - bodyRadius * 0.18, y + bodyRadius * 0.76);
        graphics.close();
        graphics.moveTo(x + bodyRadius * 0.78, y + bodyRadius * 0.5);
        graphics.lineTo(x + bodyRadius * 0.5, y + bodyRadius + earHeight);
        graphics.lineTo(x + bodyRadius * 0.18, y + bodyRadius * 0.76);
        graphics.close();
        graphics.fill();

        if (pet.level >= 4) {
            const crestCount = Math.min(4, pet.level - 3);
            graphics.fillColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, alpha);
            for (let index = 0; index < crestCount; index += 1) {
                const offset = (index - (crestCount - 1) / 2) * 8;
                graphics.moveTo(x + offset - 4, y + bodyRadius * 0.76);
                graphics.lineTo(x + offset, y + bodyRadius + 9);
                graphics.lineTo(x + offset + 4, y + bodyRadius * 0.76);
                graphics.close();
            }
            graphics.fill();
        }

        graphics.fillColor = new Color(23, 41, 45, alpha);
        graphics.circle(x - 7, y + 3, 2.6);
        graphics.circle(x + 7, y + 3, 2.6);
        graphics.fill();
        graphics.strokeColor = new Color(91, 55, 49, alpha);
        graphics.lineWidth = 1.7;
        graphics.moveTo(x - 4, y - 7);
        graphics.lineTo(x, y - 10);
        graphics.lineTo(x + 4, y - 7);
        graphics.stroke();
    }

    private drawBlade(
        graphics: Graphics,
        x: number,
        y: number,
        angle: number,
        level: number,
        alpha: number,
    ): void {
        const length = 12 + Math.min(8, level * 1.2);
        const width = 5 + Math.min(4, level * 0.45);
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const sideX = Math.cos(angle + Math.PI / 2);
        const sideY = Math.sin(angle + Math.PI / 2);
        const fills = [
            new Color(117, 202, 93, alpha),
            new Color(255, 136, 122, alpha),
            new Color(102, 206, 236, alpha),
            new Color(255, 214, 77, alpha),
            new Color(180, 129, 232, alpha),
            new Color(255, 121, 179, alpha),
        ];
        const fill = fills[Math.max(0, Math.min(fills.length - 1, level - 3))];
        graphics.fillColor = fill;
        graphics.strokeColor = new Color(COLORS.ink.r, COLORS.ink.g, COLORS.ink.b, alpha);
        graphics.lineWidth = 2;
        if (level === 6 || level === 8) {
            const points = level === 8 ? 6 : 5;
            const outer = length;
            const inner = width;
            for (let point = 0; point < points * 2; point += 1) {
                const pointAngle = angle + point * Math.PI / points;
                const radius = point % 2 === 0 ? outer : inner;
                const px = x + Math.cos(pointAngle) * radius;
                const py = y + Math.sin(pointAngle) * radius;
                if (point === 0) graphics.moveTo(px, py);
                else graphics.lineTo(px, py);
            }
        } else if (level === 3) {
            graphics.moveTo(x + forwardX * length, y + forwardY * length);
            graphics.lineTo(x + sideX * width * 1.4, y + sideY * width * 1.4);
            graphics.lineTo(x - forwardX * length * 0.65, y - forwardY * length * 0.65);
            graphics.lineTo(x - sideX * width * 0.45, y - sideY * width * 0.45);
        } else {
            graphics.moveTo(x + forwardX * length, y + forwardY * length);
            graphics.lineTo(x + sideX * width, y + sideY * width);
            graphics.lineTo(x - forwardX * length * 0.78, y - forwardY * length * 0.78);
            graphics.lineTo(x - sideX * width, y - sideY * width);
        }
        graphics.close();
        graphics.fill();
        graphics.stroke();
        graphics.fillColor = level >= 6
            ? new Color(255, 250, 206, alpha)
            : new Color(111, 74, 39, alpha);
        graphics.circle(x, y, level >= 6 ? 4.2 : 3.2);
        graphics.fill();
    }

    private drawEntity(graphics: Graphics, entity: BladeDefenseEntitySnapshot): void {
        const x = entity.x * this.trackRadius;
        const y = entity.y * this.trackRadius;
        if (entity.kind === 'chest') {
            graphics.fillColor = new Color(104, 58, 32, 255);
            graphics.strokeColor = COLORS.gold;
            graphics.lineWidth = 3;
            graphics.roundRect(x - 27, y - 21, 54, 42, 9);
            graphics.fill();
            graphics.stroke();
            graphics.fillColor = COLORS.chest;
            graphics.roundRect(x - 24, y - 16, 48, 31, 7);
            graphics.fill();
            graphics.fillColor = COLORS.gold;
            graphics.rect(x - 4, y - 19, 8, 38);
            graphics.rect(x - 25, y + 3, 50, 7);
            graphics.fill();
            graphics.fillColor = COLORS.cream;
            graphics.circle(x, y + 1, 4);
            graphics.fill();
        } else {
            graphics.fillColor = new Color(120, 86, 196, 255);
            graphics.strokeColor = new Color(218, 200, 255, 255);
            graphics.lineWidth = 2.5;
            graphics.circle(x, y, 23);
            graphics.fill();
            graphics.stroke();
            graphics.fillColor = new Color(154, 114, 224, 255);
            graphics.moveTo(x - 17, y + 13);
            graphics.lineTo(x - 10, y + 31);
            graphics.lineTo(x - 3, y + 18);
            graphics.moveTo(x + 17, y + 13);
            graphics.lineTo(x + 10, y + 31);
            graphics.lineTo(x + 3, y + 18);
            graphics.close();
            graphics.fill();
            graphics.fillColor = COLORS.white;
            graphics.circle(x - 7, y + 4, 4.5);
            graphics.circle(x + 7, y + 4, 4.5);
            graphics.fill();
            graphics.fillColor = new Color(34, 31, 55, 255);
            graphics.circle(x - 7, y + 4, 2.1);
            graphics.circle(x + 7, y + 4, 2.1);
            graphics.fill();
        }

    }

    private refreshHud(): void {
        const snapshot = this.model.snapshot;
        if (this.livesLabel) this.livesLabel.string = `♥ ${snapshot.lives}`;
        if (this.waveLabel) this.waveLabel.string = `${Math.max(1, snapshot.wave.number)}/${MAX_WAVES}`;
        if (this.scoreLabel) this.scoreLabel.string = String(snapshot.score);
        if (this.bestLabel) this.bestLabel.string = String(Math.max(this.bestScore, snapshot.score));
        if (this.endpointLabel) this.endpointLabel.string = String(snapshot.lives);
        if (this.pauseButton) {
            this.pauseButton.interactable = this.state === 'playing' || this.state === 'bonus';
        }

        const pets = snapshot.petSlots.filter((pet): pet is BladeDefensePetSnapshot => pet !== null);
        const focused = this.drag ? snapshot.petSlots[this.drag.fromSlot] : undefined;
        const highest = pets.reduce<BladeDefensePetSnapshot | undefined>((result, pet) => (
            !result || pet.level > result.level ? pet : result
        ), undefined);
        const detail = focused ?? highest;
        if (this.detailLabel) {
            this.detailLabel.string = detail
                ? `${pets.length}/${BLADE_DEFENSE_RULES.petSlotCount} 只上阵 · Lv.${detail.level} 伤害 ${detail.damage} · ${detail.bladeCount} 把刀 · 转速 ${detail.spinSpeed.toFixed(1)}`
                : '暂无上阵宠物';
        }
        if (this.queueLabel) {
            const pending = snapshot.pendingPetLevels;
            this.queueLabel.string = pending.length > 0
                ? `等待领取 ${pending.length} 只：${pending.map((level) => `Lv.${level}`).join('、')} · 合成腾位后自动进入`
                : '宝箱奖励会自动进入顺时针第一个空塔位';
            this.queueLabel.color = pending.length > 0 ? COLORS.gold : new Color(141, 192, 183, 255);
        }
        this.highestPetThisRound = Math.max(
            this.highestPetThisRound,
            ...pets.map((pet) => pet.level),
        );
    }

    private setHint(text: string): void {
        if (this.hintLabel) this.hintLabel.string = text;
    }

    private pulseNode(node?: Node): void {
        if (!node?.isValid) return;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.08, { scale: new Vec3(1.13, 1.13, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    private buildOverlay(
        name: string,
        title: string,
        body: string,
        actions: readonly OverlayAction[],
    ): OverlayState {
        const rootSize = this.node.getComponent(UITransform)?.contentSize;
        const width = rootSize?.width ?? 750;
        const height = rootSize?.height ?? 1334;
        const root = this.createNode(this.node, name, 0, 0, width, height);
        root.setSiblingIndex(this.node.children.length - 1);
        root.addComponent(BlockInputEvents);
        const shade = root.addComponent(Graphics);
        shade.fillColor = COLORS.overlay;
        shade.rect(-width / 2, -height / 2, width, height);
        shade.fill();

        const panelHeight = actions.length >= 3 ? 660 : 550;
        const panelWidth = Math.min(620, width - 64);
        const panel = this.createNode(root, 'MoonPanel', 0, 0, panelWidth, panelHeight);
        const graphics = panel.addComponent(Graphics);
        graphics.fillColor = new Color(COLORS.teal.r, COLORS.teal.g, COLORS.teal.b, 22);
        graphics.roundRect(-panelWidth / 2 - 10, -panelHeight / 2 - 10, panelWidth + 20, panelHeight + 20, 42);
        graphics.fill();
        graphics.fillColor = COLORS.panel;
        graphics.strokeColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 185);
        graphics.lineWidth = 3;
        graphics.roundRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 34);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(COLORS.teal.r, COLORS.teal.g, COLORS.teal.b, 90);
        graphics.lineWidth = 1.5;
        graphics.roundRect(-panelWidth / 2 + 9, -panelHeight / 2 + 9, panelWidth - 18, panelHeight - 18, 27);
        graphics.stroke();
        graphics.fillColor = new Color(COLORS.gold.r, COLORS.gold.g, COLORS.gold.b, 120);
        graphics.circle(-panelWidth / 2 + 34, panelHeight / 2 - 34, 4);
        graphics.circle(panelWidth / 2 - 34, panelHeight / 2 - 34, 4);
        graphics.fill();
        this.createLabel(
            panel,
            'Kicker',
            'SPRING PET GUARD',
            0,
            panelHeight / 2 - 52,
            14,
            COLORS.muted,
            panelWidth - 80,
            28,
        ).spacingX = 2;
        const titleLabel = this.createLabel(
            panel,
            'Title',
            title,
            0,
            panelHeight / 2 - 112,
            40,
            COLORS.ink,
            panelWidth - 72,
            58,
        );
        titleLabel.isBold = true;
        this.createLabel(
            panel,
            'Body',
            body,
            0,
            panelHeight / 2 - 205,
            22,
            COLORS.ink,
            panelWidth - 82,
            92,
        );

        const state: OverlayState = { root, buttons: [], busy: false };
        const startY = actions.length >= 3 ? 20 : -36;
        actions.forEach((action, index) => {
            const button = this.createButton(
                panel,
                action.name,
                action.label,
                0,
                startY - index * 102,
                Math.min(450, panelWidth - 90),
                84,
                action.tone,
            );
            button.node.on(Button.EventType.CLICK, () => this.runOverlayAction(state, action), this);
            state.buttons.push(button);
        });
        panel.setScale(0.84, 0.76, 1);
        tween(panel)
            .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
        return state;
    }

    private async runOverlayAction(state: OverlayState, action: OverlayAction): Promise<void> {
        if (state.busy) return;
        state.busy = true;
        this.context?.services.feedback.play('uiButton');
        state.buttons.forEach((button) => {
            button.interactable = false;
            const opacity = button.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 145;
        });
        try {
            await action.action();
        } catch (error: unknown) {
            console.error(`[BladeDefenseGame] ${action.name} failed.`, error);
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
        tone: 'teal' | 'gold' | 'coral' | 'dark',
    ): Button {
        const node = this.createNode(parent, name, x, y, width, height);
        node.addComponent(UIOpacity);
        const graphics = node.addComponent(Graphics);
        const accent = tone === 'teal' ? COLORS.teal
            : tone === 'gold' ? COLORS.gold
                : tone === 'coral' ? COLORS.coral
                    : new Color(119, 161, 163, 255);
        const fill = tone === 'dark'
            ? new Color(91, 116, 65, 255)
            : new Color(
                Math.round(COLORS.panel.r * 0.62 + accent.r * 0.38),
                Math.round(COLORS.panel.g * 0.62 + accent.g * 0.38),
                Math.round(COLORS.panel.b * 0.62 + accent.b * 0.38),
                255,
            );
        graphics.fillColor = new Color(accent.r, accent.g, accent.b, 30);
        graphics.roundRect(-width / 2 - 5, -height / 2 - 5, width + 10, height + 10, 24);
        graphics.fill();
        graphics.fillColor = fill;
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 210);
        graphics.lineWidth = 2.5;
        graphics.roundRect(-width / 2, -height / 2, width, height, 20);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(accent.r, accent.g, accent.b, 76);
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 6, -height / 2 + 6, width - 12, height - 12, 15);
        graphics.stroke();
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.95;
        button.duration = 0.09;
        const label = this.createLabel(
            node,
            'Label',
            text,
            0,
            0,
            height >= 80 ? 22 : 20,
            tone === 'dark' ? COLORS.white : COLORS.ink,
            width - 26,
            height - 12,
        );
        label.isBold = true;
        return button;
    }

    private createNode(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Node {
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
        label.lineHeight = fontSize + 7;
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        label.overflow = Label.Overflow.SHRINK;
        return label;
    }

    private destroyOverlay(state?: OverlayState): void {
        if (state?.root.isValid) state.root.destroy();
    }
}
