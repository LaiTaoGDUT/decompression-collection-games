import {
    _decorator,
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
    BOARD_SIZE,
    Game2048Model,
    type Game2048Direction,
    type Game2048MoveResult,
} from './Game2048Model';

const { ccclass } = _decorator;

type Game2048State = 'idle' | 'ready' | 'playing' | 'paused' | 'target' | 'completed' | 'disposed';

export interface Game2048Services {
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
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
    busy: boolean;
}

const COLORS = Object.freeze({
    void: new Color(5, 8, 22, 255),
    panel: new Color(10, 19, 37, 250),
    panelLight: new Color(17, 31, 53, 255),
    slot: new Color(17, 30, 49, 235),
    cyan: new Color(66, 222, 207, 255),
    cyanDim: new Color(66, 222, 207, 64),
    violet: new Color(154, 119, 244, 255),
    violetDim: new Color(154, 119, 244, 54),
    amber: new Color(246, 183, 82, 255),
    amberDim: new Color(246, 183, 82, 64),
    white: new Color(226, 240, 248, 255),
    muted: new Color(130, 157, 181, 255),
    overlay: new Color(2, 5, 14, 224),
});

const TILE_COLORS: Readonly<Record<number, readonly [number, number, number]>> = Object.freeze({
    2: [79, 170, 209],
    4: [67, 194, 206],
    8: [59, 207, 185],
    16: [67, 218, 161],
    32: [95, 220, 137],
    64: [139, 219, 112],
    128: [188, 207, 93],
    256: [222, 194, 82],
    512: [239, 170, 79],
    1024: [238, 131, 87],
    2048: [246, 183, 82],
});

@ccclass('Game2048Game')
export class Game2048Game extends Component implements MiniGame {
    private state: Game2048State = 'idle';
    private context?: MiniGameContext<Game2048Services>;
    private readonly model = new Game2048Model();
    private boardNode?: Node;
    private boardContent?: Node;
    private scoreLabel?: Label;
    private bestLabel?: Label;
    private undoButton?: Button;
    private pauseButton?: Button;
    private pauseOverlay?: OverlayState;
    private resultOverlay?: OverlayState;
    private targetOverlay?: OverlayState;
    private audioBank?: BundleAudioBank;
    private inputLocked = false;
    private touchStartX = 0;
    private touchStartY = 0;
    private playCount = 0;
    private bestScore = 0;
    private historicalHighestTile = 0;
    private roundStartingBest = 0;

    setRandomSourceForTesting(random: () => number): void {
        this.model.setRandomSource(random);
    }

    async initialize(context: MiniGameContext<Game2048Services>): Promise<void> {
        if (this.state !== 'idle') throw new Error(`Cannot initialize Game2048Game from ${this.state}.`);
        this.context = context;
        this.readSave();
        this.buildInterface();
        this.registerInput();
        this.audioBank = new BundleAudioBank({
            bundle: 'game-2048',
            music: 'visual/audio/t48-neon-loop-v1',
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
        this.startRound();
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
    }

    async restart(): Promise<void> {
        if (this.state === 'disposed') throw new Error('Cannot restart a disposed Game2048Game.');
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.startRound();
    }

    async dispose(): Promise<void> {
        if (this.state === 'disposed') return;
        this.state = 'disposed';
        this.unregisterInput();
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.destroyOverlay(this.pauseOverlay);
        this.destroyOverlay(this.resultOverlay);
        this.destroyOverlay(this.targetOverlay);
        this.node.children.slice().forEach((child) => child.destroy());
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
        this.hideResultView();
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
            ],
        );
    }

    hideResultView(): void {
        this.destroyOverlay(this.resultOverlay);
        this.resultOverlay = undefined;
    }

    private startRound(): void {
        this.model.reset();
        this.playCount += 1;
        this.roundStartingBest = this.bestScore;
        this.state = 'playing';
        this.inputLocked = false;
        this.context?.reportScore(0);
        this.persistProgress();
        this.renderBoard();
        this.refreshHud();
    }

    private registerInput(): void {
        this.node.on(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.undoButton?.node.on(Button.EventType.CLICK, this.handleUndo, this);
        this.pauseButton?.node.on(Button.EventType.CLICK, this.handlePause, this);
        input.on(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
    }

    private unregisterInput(): void {
        this.node.off(Node.EventType.TOUCH_START, this.handleTouchStart, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleTouchEnd, this);
        this.undoButton?.node.off(Button.EventType.CLICK, this.handleUndo, this);
        this.pauseButton?.node.off(Button.EventType.CLICK, this.handlePause, this);
        input.off(Input.EventType.KEY_DOWN, this.handleKeyDown, this);
    }

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

    private readonly handleUndo = (): void => {
        if (this.state !== 'playing' || this.inputLocked) return;
        if (!this.model.undo()) {
            this.context?.services.feedback.play('collision');
            return;
        }
        this.context?.services.feedback.play('uiButton');
        this.context?.reportScore(this.model.score);
        this.renderBoard();
        this.refreshHud();
        this.persistProgress();
    };

    private readonly handlePause = (): void => {
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
        this.renderBoard(result, direction);
        this.refreshHud();
        this.persistProgress();

        this.scheduleOnce(() => {
            if (this.state !== 'playing') return;
            this.inputLocked = false;
            if (result.reachedTarget) {
                this.showTargetOverlay();
            } else if (result.gameOver) {
                this.finishRound('no-moves');
            }
        }, 0.16);
    }

    private playMoveFeedback(result: Game2048MoveResult): void {
        if (result.mergedIndices.length > 1) this.context?.services.feedback.play('chain');
        else if (result.mergedIndices.length === 1) this.context?.services.feedback.play('merge');
        else this.context?.services.feedback.play('drop');
        if (result.reachedTarget) this.context?.services.feedback.play('milestone');
    }

    private showTargetOverlay(): void {
        if (this.state !== 'playing') return;
        this.state = 'target';
        this.inputLocked = true;
        this.targetOverlay = this.buildOverlay(
            'Game2048TargetOverlay',
            '2048 已点亮',
            `当前分数  ${this.model.score}\n继续挑战更高数字？`,
            [
                {
                    name: 'ContinueButton',
                    label: '继续挑战',
                    tone: 'cyan',
                    action: () => {
                        this.destroyOverlay(this.targetOverlay);
                        this.targetOverlay = undefined;
                        this.state = 'playing';
                        this.inputLocked = false;
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
        this.context?.services.audio.pauseMusic();
        const newRecord = this.model.score > this.roundStartingBest;
        this.bestScore = Math.max(this.bestScore, this.model.score);
        this.historicalHighestTile = Math.max(this.historicalHighestTile, this.model.highestTile);
        this.persistProgress();
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
        this.playCount = data?.playCount ?? 0;
        this.bestScore = Math.max(0, Math.floor(data?.highScore ?? 0));
        const highest = data?.custom?.highestTile;
        this.historicalHighestTile = typeof highest === 'number' && Number.isFinite(highest)
            ? Math.max(0, Math.floor(highest))
            : 0;
    }

    private persistProgress(): void {
        const storage = this.context?.services.storage;
        if (!storage) return;
        const data: GameSaveData = {
            dataVersion: 1,
            playCount: this.playCount,
            highScore: Math.max(this.bestScore, this.model.score),
            lastPlayedAt: Date.now(),
            custom: Object.freeze({
                highestTile: Math.max(this.historicalHighestTile, this.model.highestTile),
            }),
        };
        try {
            storage.writeGameData('game2048', data);
        } catch (error: unknown) {
            console.error('[Game2048Game] Save failed.', error);
        }
    }

    private buildInterface(): void {
        this.node.children.slice().forEach((child) => child.destroy());
        const visible = view.getVisibleSize();
        const canvasSize = this.node.parent?.getComponent(UITransform)?.contentSize;
        const width = Math.max(600, Math.min(750, canvasSize?.width ?? visible.width));
        const height = Math.max(1100, Math.min(1624, canvasSize?.height ?? visible.height));
        this.node.getComponent(UITransform)?.setContentSize(width, height);

        const backdropBleed = 32;
        const backdrop = this.createNode(
            this.node,
            'NeonBackdrop',
            0,
            0,
            width + backdropBleed,
            height + backdropBleed,
        );
        const background = backdrop.addComponent(Graphics);
        background.fillColor = COLORS.void;
        background.rect(
            -(width + backdropBleed) / 2,
            -(height + backdropBleed) / 2,
            width + backdropBleed,
            height + backdropBleed,
        );
        background.fill();

        // Wide, low-alpha pools create a neon atmosphere without leaving bright hotspots.
        [
            { x: -width * 0.48, y: height * 0.35, radius: 310, color: COLORS.cyan, alpha: 5 },
            { x: -width * 0.48, y: height * 0.35, radius: 220, color: COLORS.cyan, alpha: 7 },
            { x: -width * 0.48, y: height * 0.35, radius: 145, color: COLORS.cyan, alpha: 9 },
            { x: width * 0.48, y: height * 0.22, radius: 270, color: COLORS.violet, alpha: 5 },
            { x: width * 0.48, y: height * 0.22, radius: 178, color: COLORS.violet, alpha: 7 },
            { x: width * 0.46, y: -height * 0.34, radius: 300, color: COLORS.amber, alpha: 4 },
            { x: width * 0.46, y: -height * 0.34, radius: 195, color: COLORS.amber, alpha: 6 },
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

        const titleFrame = this.createNode(this.node, 'TitleCircuit', 0, height / 2 - 119, width - 230, 104);
        const titleGraphics = titleFrame.addComponent(Graphics);
        titleGraphics.strokeColor = new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 82);
        titleGraphics.lineWidth = 2;
        titleGraphics.moveTo(-255, 18);
        titleGraphics.lineTo(-162, 18);
        titleGraphics.moveTo(162, 18);
        titleGraphics.lineTo(255, 18);
        titleGraphics.stroke();
        titleGraphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 128);
        titleGraphics.moveTo(-82, -35);
        titleGraphics.lineTo(82, -35);
        titleGraphics.stroke();
        titleGraphics.fillColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 155);
        titleGraphics.circle(-255, 18, 3);
        titleGraphics.circle(255, 18, 3);
        titleGraphics.fill();

        const titleVioletGlow = this.createLabel(
            this.node,
            'TitleVioletGlow',
            'NEON  2048',
            2,
            height / 2 - 103,
            49,
            new Color(COLORS.violet.r, COLORS.violet.g, COLORS.violet.b, 42),
            width - 254,
            68,
        );
        titleVioletGlow.isBold = true;
        titleVioletGlow.spacingX = 5;
        const titleCyanGlow = this.createLabel(
            this.node,
            'TitleCyanGlow',
            'NEON  2048',
            -2,
            height / 2 - 105,
            48,
            new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 48),
            width - 256,
            66,
        );
        titleCyanGlow.isBold = true;
        titleCyanGlow.spacingX = 5;
        const title = this.createLabel(this.node, 'Title', 'NEON  2048', 0, height / 2 - 104, 46, COLORS.white, width - 260, 64);
        title.isBold = true;
        title.spacingX = 5;
        this.createLabel(this.node, 'Subtitle', 'DIGITAL MERGE CIRCUIT', 0, height / 2 - 151, 16, COLORS.cyan, 360, 30).spacingX = 3;

        this.undoButton = this.createButton(this.node, 'UndoButton', '撤销', -width / 2 + 82, height / 2 - 116, 104, 58, 'dark');
        this.pauseButton = this.createButton(this.node, 'PauseButton', '暂停', width / 2 - 82, height / 2 - 116, 104, 58, 'dark');

        this.scoreLabel = this.createHudCard(-108, height / 2 - 230, '分数', COLORS.cyan);
        this.bestLabel = this.createHudCard(108, height / 2 - 230, '最高', COLORS.amber);

        const boardSize = Math.min(622, width - 82);
        const boardY = Math.min(28, height / 2 - 646);
        this.boardNode = this.createNode(this.node, 'BoardPanel', 0, boardY, boardSize + 24, boardSize + 24);
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

        this.createLabel(this.node, 'Hint', '滑动屏幕或使用方向键 · 相同数字会合并', 0, boardY - boardSize / 2 - 70, 22, COLORS.muted, width - 80, 42);
        this.createLabel(this.node, 'Signal', 'NO ADS · PURE FLOW', 0, -height / 2 + 52, 14, new Color(87, 125, 151, 255), 300, 28).spacingX = 3;
    }

    private buildSlots(boardSize: number): void {
        if (!this.boardContent) return;
        const gap = 13;
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;
        for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
            const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
            const slot = this.createNode(this.boardContent, `Slot-${index}`, x, y, tileSize, tileSize);
            const graphics = slot.addComponent(Graphics);
            graphics.fillColor = COLORS.slot;
            graphics.strokeColor = new Color(91, 157, 177, 36);
            graphics.lineWidth = 1;
            graphics.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, 20);
            graphics.fill();
            graphics.stroke();
            graphics.strokeColor = new Color(COLORS.cyan.r, COLORS.cyan.g, COLORS.cyan.b, 20);
            graphics.moveTo(-tileSize / 2 + 20, tileSize / 2 - 9);
            graphics.lineTo(tileSize / 2 - 20, tileSize / 2 - 9);
            graphics.stroke();
        }
    }

    private renderBoard(result?: Game2048MoveResult, direction?: Game2048Direction): void {
        const content = this.boardContent;
        const panel = this.boardNode?.getComponent(UITransform);
        if (!content || !panel) return;
        content.children.filter((child) => child.name.startsWith('Tile-')).forEach((child) => child.destroy());
        const boardSize = panel.contentSize.width - 24;
        const gap = 13;
        const tileSize = (boardSize - gap * (BOARD_SIZE + 1)) / BOARD_SIZE;

        this.model.board.forEach((value, index) => {
            if (value === 0) return;
            const { x, y } = this.tilePosition(index, boardSize, gap, tileSize);
            const tile = this.createNode(content, `Tile-${index}`, x, y, tileSize, tileSize);
            this.drawTile(tile, value, tileSize);
            if (result?.spawned?.index === index) {
                tile.setScale(0.45, 0.45, 1);
                tween(tile).to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
            } else if ((result?.mergedIndices.indexOf(index) ?? -1) >= 0) {
                tile.setScale(0.78, 0.78, 1);
                tween(tile)
                    .to(0.1, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' })
                    .to(0.08, { scale: new Vec3(1, 1, 1) })
                    .start();
            }
        });

        if (direction) {
            const offset = direction === 'left' ? new Vec3(-14, 0, 0)
                : direction === 'right' ? new Vec3(14, 0, 0)
                    : direction === 'up' ? new Vec3(0, 14, 0) : new Vec3(0, -14, 0);
            Tween.stopAllByTarget(content);
            content.setPosition(offset);
            tween(content).to(0.1, { position: new Vec3(0, 0, 0) }, { easing: 'quadOut' }).start();
        }
    }

    private drawTile(tile: Node, value: number, size: number): void {
        const rgb = TILE_COLORS[value] ?? [214, 112, 188];
        const base = [7, 15, 29] as const;
        const fill = rgb.map((channel, index) => Math.round(base[index] + channel * 0.24));
        const graphics = tile.addComponent(Graphics);
        graphics.fillColor = new Color(0, 0, 0, 70);
        graphics.roundRect(-size / 2 - 2, -size / 2 - 7, size + 4, size + 4, 23);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 15);
        graphics.roundRect(-size / 2 - 7, -size / 2 - 7, size + 14, size + 14, 26);
        graphics.fill();
        graphics.fillColor = new Color(rgb[0], rgb[1], rgb[2], 27);
        graphics.roundRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8, 24);
        graphics.fill();
        graphics.fillColor = new Color(fill[0], fill[1], fill[2], 255);
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], value >= 2048 ? 220 : 178);
        graphics.lineWidth = value >= 2048 ? 3 : 2;
        graphics.roundRect(-size / 2, -size / 2, size, size, 20);
        graphics.fill();
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 50);
        graphics.lineWidth = 1;
        graphics.roundRect(-size / 2 + 5, -size / 2 + 5, size - 10, size - 10, 16);
        graphics.stroke();
        graphics.strokeColor = new Color(rgb[0], rgb[1], rgb[2], 108);
        graphics.moveTo(-size / 2 + 18, size / 2 - 9);
        graphics.lineTo(size / 2 - 18, size / 2 - 9);
        graphics.stroke();
        const digits = value.toString().length;
        const fontSize = digits <= 2 ? 52 : digits === 3 ? 46 : digits === 4 ? 38 : 31;
        const color = new Color(
            Math.round(COLORS.white.r * 0.82 + rgb[0] * 0.18),
            Math.round(COLORS.white.g * 0.82 + rgb[1] * 0.18),
            Math.round(COLORS.white.b * 0.82 + rgb[2] * 0.18),
            255,
        );
        const label = this.createLabel(tile, 'Value', String(value), 0, 2, fontSize, color, size - 12, size - 12);
        label.isBold = true;
    }

    private refreshHud(): void {
        if (this.scoreLabel) this.scoreLabel.string = String(this.model.score);
        if (this.bestLabel) this.bestLabel.string = String(Math.max(this.bestScore, this.model.score));
        if (this.undoButton) this.undoButton.interactable = this.model.canUndo && this.state === 'playing';
        const opacity = this.undoButton?.node.getComponent(UIOpacity);
        if (opacity) opacity.opacity = this.undoButton?.interactable ? 255 : 110;
    }

    private createHudCard(x: number, y: number, caption: string, accent: Color): Label {
        const card = this.createNode(this.node, `${caption}Card`, x, y, 188, 92);
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

    private buildOverlay(name: string, title: string, body: string, actions: readonly OverlayAction[]): OverlayState {
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

        const panelHeight = actions.length === 2 ? 500 : 590;
        const panel = this.createNode(root, 'NeonPanel', 0, 0, Math.min(590, width - 80), panelHeight);
        const panelWidth = panel.getComponent(UITransform)!.contentSize.width;
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

        const state: OverlayState = { root, buttons: [], busy: false };
        const startY = actions.length === 2 ? -70 : -62;
        actions.forEach((action, index) => {
            const button = this.createButton(panel, action.name, action.label, 0, startY - index * 84, 360, 62, action.tone);
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
        if (state?.root.isValid) state.root.destroy();
    }
}
