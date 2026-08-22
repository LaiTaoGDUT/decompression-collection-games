import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Color,
    Component,
    Graphics,
    Label,
    Layers,
    Node,
    Texture2D,
    UITransform,
    view,
} from 'cc';
import type { GameResult } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext } from '../../../runtime/MiniGame';
import { calculateTopRightControlPosition } from '../../../shared/ui/PlatformSafeLayout';
import { ENDLESS_SWORD_CONFIG } from './config/GameConfig';
import { GameLoop } from './core/GameLoop';
import { RunModel } from './core/RunModel';
import { PlayerSystem } from './systems/PlayerSystem';
import type { EndlessSwordRunState, EndlessSwordServices } from './EndlessSwordTypes';
import { CameraRig } from './view/CameraRig';
import { FloatingJoystick } from './view/FloatingJoystick';
import { PlayerView } from './view/PlayerView';
import { WorldBackground } from './view/WorldBackground';

const { ccclass } = _decorator;

// SW1 视觉令牌（docs/ENDLESS_SWORD_VISUAL_SPEC.md §2）。开发占位色；
// 正式素材接入后仅由 UI 层引用，玩法层不得硬编码颜色。
const SW1_COLORS = Object.freeze({
    battlefield: new Color(21, 37, 33, 255), // #152521 玄青底
    panel: new Color(16, 24, 23, 255), // #101817 深色 UI
    aura: new Color(100, 214, 180, 255), // #64D6B4 灵气青
    gold: new Color(231, 198, 106, 255), // #E7C66A 仙金
    danger: new Color(232, 93, 93, 255), // #E85D5D 危险红
    textDim: new Color(148, 168, 160, 255),
});

const START_BUTTON_WIDTH = 320;
const START_BUTTON_HEIGHT = 96;
const PAUSE_BUTTON_SIZE = 72;
const HUD_TOP_INSET = 96;

/**
 * 《无尽剑域》入口组件。
 * M1 当前进度：30Hz 固定步循环 + 无限地图 + 浮动摇杆移动；
 * 敌人、技能、升级、结算玩法按开发计划 M1 后续任务接入。
 */
@ccclass('EndlessSwordGame')
export class EndlessSwordGame extends Component implements MiniGame<EndlessSwordServices> {
    private context?: MiniGameContext<EndlessSwordServices>;
    private runState: EndlessSwordRunState = 'idle';

    private readonly model = new RunModel();
    private loop?: GameLoop;
    private playerSystem?: PlayerSystem;

    private worldRoot?: Node;
    private world?: WorldBackground;
    private playerView?: PlayerView;
    private cameraRig?: CameraRig;
    private joystick?: FloatingJoystick;

    private startOverlay?: Node;
    private hudRoot?: Node;
    private survivalLabel?: Label;

    // ---- MiniGame 生命周期（策划案 §4 与 Runtime 状态机映射见开发计划 §4.3）----

    async initialize(context: MiniGameContext<EndlessSwordServices>): Promise<void> {
        this.context = context;
        this.model.reset(Date.now() >>> 0);
        this.playerSystem = new PlayerSystem(this.model);
        this.loop = new GameLoop(
            ENDLESS_SWORD_CONFIG.loop.logicHz,
            ENDLESS_SWORD_CONFIG.loop.maxFrameSeconds,
            ENDLESS_SWORD_CONFIG.loop.maxCatchUpSteps,
            (dt) => this.stepLogic(dt),
        );
        this.buildWorld(await this.loadPlayerTexture());
        this.joystick = new FloatingJoystick(this.node);
        this.buildHud();
        this.buildStartOverlay();
        this.installQaBridge();
        this.runState = 'ready';
    }

    /** 加载玩家序列帧纹理；失败时回退几何占位（可选资源）。 */
    private async loadPlayerTexture(): Promise<Texture2D | undefined> {
        return new Promise<Texture2D | undefined>((resolve) => {
            assetManager.loadBundle('game-endless-sword', (bundleError, bundle) => {
                if (bundleError || !bundle) {
                    resolve(undefined);
                    return;
                }
                bundle.load(
                    ENDLESS_SWORD_CONFIG.playerSprite.texturePath,
                    Texture2D,
                    (loadError, asset) => resolve(loadError ? undefined : asset),
                );
            });
        });
    }

    begin(): void {
        if (this.runState !== 'ready') {
            return;
        }
        // 停在开始页等待玩家点击“开始修行”。
    }

    pause(): void {
        if (this.runState !== 'playing') {
            return;
        }
        this.runState = 'paused';
        this.joystick?.resetInput();
    }

    resume(): void {
        if (this.runState === 'paused') {
            this.runState = 'playing';
        }
    }

    async restart(context?: MiniGameContext<EndlessSwordServices>): Promise<void> {
        if (context) {
            this.context = context;
        }
        // 策划案 §114：不重载 Bundle，清空重置后直接开始（新 runSeed）；
        // Runtime 在 restart 之后不会再调用 begin。
        this.model.reset(Date.now() >>> 0);
        this.world?.setSeed(this.model.runSeed);
        this.world?.update(0, 0);
        this.joystick?.resetInput();
        this.loop?.reset();
        this.renderFrame(0, 0);
        this.enterPlaying();
    }

    async dispose(): Promise<void> {
        this.runState = 'disposed';
        this.removeQaBridge();
        this.joystick?.dispose();
        this.joystick = undefined;
        this.playerView?.destroy();
        this.playerView = undefined;
        this.destroyNode(this.worldRoot);
        this.worldRoot = undefined;
        this.world = undefined;
        this.cameraRig = undefined;
        this.loop = undefined;
        this.playerSystem = undefined;
        this.destroyNode(this.startOverlay);
        this.startOverlay = undefined;
        this.destroyNode(this.hudRoot);
        this.hudRoot = undefined;
        this.survivalLabel = undefined;
        this.context = undefined;
    }

    // ---- 游戏循环（策划案 §5：只有 playing 状态推进游戏时间）----

    update(deltaTime: number): void {
        if (this.runState !== 'playing') {
            return;
        }
        const alpha = this.loop ? this.loop.tick(deltaTime) : 0;
        this.renderFrame(alpha, deltaTime);
    }

    private stepLogic(dt: number): void {
        this.model.beginLogicStep();
        this.model.gameplayElapsedTime += dt;
        if (this.playerSystem && this.joystick) {
            this.playerSystem.step(this.joystick.getMoveInput(), dt);
        }
        this.world?.update(this.model.player.x, this.model.player.y);
    }

    private renderFrame(alpha: number, frameSeconds: number): void {
        const renderPos = this.model.lerpPlayer(alpha);
        this.playerView?.setWorldPosition(renderPos.x, renderPos.y);
        this.playerView?.setMotion(
            this.model.player.moveDirX,
            this.model.player.moveDirY,
            this.model.player.moveMagnitude,
        );
        this.playerView?.tickAnimation(frameSeconds);
        this.cameraRig?.follow(renderPos.x, renderPos.y);
        if (this.survivalLabel) {
            this.survivalLabel.string = formatSurvivalTime(this.model.gameplayElapsedTime);
        }
    }

    // ---- 世界与输入 ----

    private buildWorld(playerTexture?: Texture2D): void {
        const worldRoot = new Node('World');
        worldRoot.layer = Layers.Enum.UI_2D;
        this.node.addChild(worldRoot);
        this.worldRoot = worldRoot;

        this.world = new WorldBackground(worldRoot);
        this.world.setSeed(this.model.runSeed);
        this.world.update(0, 0);

        this.playerView = new PlayerView(worldRoot, playerTexture);
        this.cameraRig = new CameraRig(worldRoot);
        this.playerView.setWorldPosition(0, 0);
    }

    // ---- 开发占位 UI ----

    private buildStartOverlay(): void {
        const visibleSize = view.getVisibleSize();

        const overlay = new Node('StartOverlay');
        overlay.layer = Layers.Enum.UI_2D;
        overlay.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
        overlay.addComponent(BlockInputEvents);
        this.node.addChild(overlay);

        const title = new Node('Title');
        title.layer = Layers.Enum.UI_2D;
        overlay.addChild(title);
        title.addComponent(UITransform).setContentSize(visibleSize.width * 0.8, 110);
        const titleLabel = title.addComponent(Label);
        titleLabel.string = '无尽剑域';
        titleLabel.fontSize = 88;
        titleLabel.lineHeight = 110;
        titleLabel.color = SW1_COLORS.gold;
        title.setPosition(0, visibleSize.height * 0.2, 0);

        const subtitle = new Node('Subtitle');
        subtitle.layer = Layers.Enum.UI_2D;
        overlay.addChild(subtitle);
        subtitle.addComponent(UITransform).setContentSize(visibleSize.width * 0.8, 40);
        const subtitleLabel = subtitle.addComponent(Label);
        subtitleLabel.string = '单手御剑 · 无尽割草（M1 开发中）';
        subtitleLabel.fontSize = 28;
        subtitleLabel.lineHeight = 40;
        subtitleLabel.color = SW1_COLORS.textDim;
        subtitle.setPosition(0, visibleSize.height * 0.2 - 96, 0);

        const startButton = this.createTextButton(
            'StartButton',
            '开始修行',
            START_BUTTON_WIDTH,
            START_BUTTON_HEIGHT,
            40,
            SW1_COLORS.battlefield,
            SW1_COLORS.aura,
            () => this.enterPlaying(),
        );
        overlay.addChild(startButton);
        startButton.setPosition(0, -visibleSize.height * 0.12, 0);

        this.startOverlay = overlay;
    }

    private buildHud(): void {
        const visibleSize = view.getVisibleSize();

        const hud = new Node('Hud');
        hud.layer = Layers.Enum.UI_2D;
        hud.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
        this.node.addChild(hud);

        // 顶部中央生存时间。占位布局；正式 HUD 随 M1 的 Layout 模块落地。
        const survivalNode = new Node('SurvivalTime');
        survivalNode.layer = Layers.Enum.UI_2D;
        hud.addChild(survivalNode);
        survivalNode.addComponent(UITransform).setContentSize(240, 48);
        this.survivalLabel = survivalNode.addComponent(Label);
        this.survivalLabel.string = '00:00';
        this.survivalLabel.fontSize = 38;
        this.survivalLabel.lineHeight = 48;
        this.survivalLabel.color = SW1_COLORS.gold;
        survivalNode.setPosition(0, visibleSize.height / 2 - HUD_TOP_INSET, 0);

        // 右上暂停按钮：必须走平台安全区计算，禁止写死坐标。
        const pausePosition = calculateTopRightControlPosition(
            visibleSize.width,
            visibleSize.height,
            this.context?.services.platform.getLayoutInfo(),
            {
                controlWidth: PAUSE_BUTTON_SIZE,
                controlHeight: PAUSE_BUTTON_SIZE,
                rightInset: 24,
                defaultTopInset: 24,
            },
        );
        const pauseButton = this.createTextButton(
            'PauseButton',
            '暂停',
            PAUSE_BUTTON_SIZE,
            PAUSE_BUTTON_SIZE,
            26,
            SW1_COLORS.battlefield,
            SW1_COLORS.panel,
            () => this.context?.requestPause(),
        );
        hud.addChild(pauseButton);
        pauseButton.setPosition(pausePosition.x, pausePosition.y, 0);

        // 开发期按钮：验证结算链路，正式死亡接入后移除。
        const finishButton = this.createTextButton(
            'DevFinishButton',
            '结束本局（测试）',
            260,
            72,
            26,
            SW1_COLORS.battlefield,
            SW1_COLORS.danger,
            () => this.finishRun(),
        );
        hud.addChild(finishButton);
        finishButton.setPosition(
            -visibleSize.width / 2 + 170,
            -visibleSize.height / 2 + 90,
            0,
        );

        hud.active = false;
        this.hudRoot = hud;
    }

    private createTextButton(
        name: string,
        text: string,
        width: number,
        height: number,
        fontSize: number,
        textColor: Color,
        background: Color,
        onTap: () => void,
    ): Node {
        const button = new Node(name);
        button.layer = Layers.Enum.UI_2D;
        const transform = button.addComponent(UITransform);
        transform.setContentSize(width, height);

        // 一个节点只挂一个渲染组件：底板用 Graphics，文字放子节点，否则 Label 不渲染。
        const graphics = button.addComponent(Graphics);
        graphics.fillColor = background;
        graphics.roundRect(-width / 2, -height / 2, width, height, 12);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.layer = Layers.Enum.UI_2D;
        button.addChild(labelNode);
        labelNode.addComponent(UITransform).setContentSize(width, height);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize * 1.2;
        label.color = textColor;

        button.on(Node.EventType.TOUCH_END, onTap);
        return button;
    }

    private enterPlaying(): void {
        this.loop?.reset();
        if (this.startOverlay) {
            this.startOverlay.active = false;
        }
        if (this.hudRoot) {
            this.hudRoot.active = true;
        }
        this.runState = 'playing';
    }

    private finishRun(): void {
        if (this.runState !== 'playing') {
            return;
        }
        this.runState = 'completed';
        this.joystick?.resetInput();
        const result: GameResult = {
            score: this.model.survivalScore,
            duration: Math.floor(this.model.gameplayElapsedTime * 1000),
            completed: true,
            extra: {
                reason: 'dev-finish',
                bossKills: 0,
                realm: '炼气',
                level: 1,
                kills: 0,
            },
        };
        this.context?.reportScore(result.score);
        this.context?.requestExit(result);
    }

    private destroyNode(target: Node | undefined): void {
        if (target && target.isValid) {
            target.destroy();
        }
    }

    // ---- QA 桥（随里程碑逐步补全至策划案 §120 全量命令）----

    private installQaBridge(): void {
        const host = globalThis as unknown as Record<string, unknown>;
        host.__ENDLESS_SWORD_QA__ = Object.freeze({
            snapshot: (): unknown => this.createSnapshot(),
            start: (): void => this.enterPlaying(),
            resume: (): void => this.resume(),
            finish: (): void => this.finishRun(),
        });
    }

    private removeQaBridge(): void {
        const host = globalThis as unknown as Record<string, unknown>;
        delete host.__ENDLESS_SWORD_QA__;
    }

    private createSnapshot(): unknown {
        return Object.freeze({
            state: this.runState,
            runSeed: this.model.runSeed,
            gameplayElapsedTime: this.model.gameplayElapsedTime,
            survivalScore: this.model.survivalScore,
            player: Object.freeze({
                x: this.model.player.x,
                y: this.model.player.y,
                hp: this.model.player.hp,
            }),
            visible: view.getVisibleSize(),
        });
    }
}

function formatSurvivalTime(seconds: number): string {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);
    return `${pad(minutes)}:${pad(rest)}`;
}
