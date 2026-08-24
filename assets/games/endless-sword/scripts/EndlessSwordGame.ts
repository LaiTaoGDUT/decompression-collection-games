import {
    _decorator,
    Camera,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Texture2D,
    UITransform,
    view,
} from 'cc';
import { DEV } from 'cc/env';
import type { GameResult } from '../../../core/types/CommonTypes';
import type { MiniGame, MiniGameContext } from '../../../runtime/MiniGame';
import {
    calculateTopRightControlPosition,
    calculateVerticalSafeBounds,
} from '../../../shared/ui/PlatformSafeLayout';
import { ENDLESS_SWORD_CONFIG } from './config/GameConfig';
import {
    ENEMY_TYPES,
    T1_ENEMY_SHOWCASE,
    getEnemyConfig,
    type EnemyType,
} from './config/EnemyConfig';
import type { EnemyModel } from './core/CombatModels';
import { GameLoop } from './core/GameLoop';
import { RunModel } from './core/RunModel';
import { CollisionSystem } from './systems/CollisionSystem';
import { EnemySystem } from './systems/EnemySystem';
import { PlayerSystem } from './systems/PlayerSystem';
import { ProjectileSystem } from './systems/ProjectileSystem';
import { XpOrbSystem } from './systems/XpOrbSystem';
import type { EndlessSwordRunState, EndlessSwordServices } from './EndlessSwordTypes';
import { CameraRig } from './view/CameraRig';
import { EnemyView } from './view/EnemyView';
import { FloatingJoystick } from './view/FloatingJoystick';
import { PlayerView } from './view/PlayerView';
import { ProjectileView } from './view/ProjectileView';
import { WorldBackground } from './view/WorldBackground';
import { XpOrbView } from './view/XpOrbView';

const { ccclass, property } = _decorator;

// SW1 视觉令牌（docs/ENDLESS_SWORD_VISUAL_SPEC.md §2）。开发占位色；
// 正式素材接入后仅由 UI 层引用，玩法层不得硬编码颜色。
const SW1_COLORS = Object.freeze({
    battlefield: new Color(21, 37, 33, 255), // #152521 玄青底
    panel: new Color(16, 24, 23, 255), // #101817 深色 UI
    gold: new Color(231, 198, 106, 255), // #E7C66A 仙金
    danger: new Color(232, 93, 93, 255), // #E85D5D 危险红
});

/**
 * 《无尽剑域》入口组件。
 * M1 当前进度：30Hz 固定步循环 + 无限地图 + 移动 + T1.4/T1.5 碰撞、对象池与四敌；
 * 玩家技能、升级和正式结算视图按开发计划 M1 后续任务接入。
 */
@ccclass('EndlessSwordGame')
export class EndlessSwordGame extends Component implements MiniGame<EndlessSwordServices> {
    @property(Camera)
    private worldCamera: Camera | null = null;

    @property(Texture2D)
    private playerTexture: Texture2D | null = null;

    @property(Texture2D)
    private demonRatTexture: Texture2D | null = null;

    @property(Texture2D)
    private ghostFlameTexture: Texture2D | null = null;

    @property(Texture2D)
    private rottingCorpseTexture: Texture2D | null = null;

    @property(Texture2D)
    private crossbowPuppetTexture: Texture2D | null = null;

    private context?: MiniGameContext<EndlessSwordServices>;
    private runState: EndlessSwordRunState = 'idle';

    private readonly model = new RunModel();
    private loop?: GameLoop;
    private playerSystem?: PlayerSystem;
    private enemySystem?: EnemySystem;
    private projectileSystem?: ProjectileSystem;
    private xpOrbSystem?: XpOrbSystem;
    private collisionSystem?: CollisionSystem;

    private worldRoot?: Node;
    private world?: WorldBackground;
    private playerView?: PlayerView;
    private enemyView?: EnemyView;
    private projectileView?: ProjectileView;
    private xpOrbView?: XpOrbView;
    private cameraRig?: CameraRig;
    private joystick?: FloatingJoystick;

    private hudRoot?: Node;
    private survivalLabel?: Label;
    private pauseButton?: Node;
    private finishButton?: Node;
    private resizeListening = false;
    private lastReportedScore = Number.NaN;
    private nextScoreReportTime = 0;
    private qaBridge?: Readonly<Record<string, unknown>>;

    // ---- MiniGame 生命周期（策划案 §4 与 Runtime 状态机映射见开发计划 §4.3）----

    async initialize(context: MiniGameContext<EndlessSwordServices>): Promise<void> {
        if (this.runState !== 'idle') {
            throw new Error(`Cannot initialize EndlessSwordGame from ${this.runState}.`);
        }
        this.context = context;
        this.model.reset(0);
        this.playerSystem = new PlayerSystem(this.model);
        this.enemySystem = new EnemySystem();
        this.projectileSystem = new ProjectileSystem();
        this.xpOrbSystem = new XpOrbSystem();
        this.collisionSystem = new CollisionSystem();
        this.loop = new GameLoop(
            ENDLESS_SWORD_CONFIG.loop.logicHz,
            ENDLESS_SWORD_CONFIG.loop.maxFrameSeconds,
            ENDLESS_SWORD_CONFIG.loop.maxCatchUpSteps,
            (dt) => this.stepLogic(dt),
        );
        this.buildWorld(this.playerTexture ?? undefined);
        this.joystick = new FloatingJoystick(this.node);
        this.joystick.setEnabled(false);
        this.buildHud();
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.resizeListening = true;
        this.applyLayout();
        this.runState = 'ready';
        this.installQaBridge();
    }

    begin(): void {
        if (this.runState !== 'ready') {
            throw new Error(`Cannot begin EndlessSwordGame from ${this.runState}.`);
        }
        this.startNewRun();
    }

    pause(): void {
        if (this.runState !== 'playing') {
            return;
        }
        this.reportCurrentScore(true);
        this.runState = 'paused';
        this.joystick?.setEnabled(false);
    }

    resume(): void {
        if (this.runState === 'paused') {
            this.runState = 'playing';
            this.joystick?.setEnabled(true);
        }
    }

    async restart(context?: MiniGameContext<EndlessSwordServices>): Promise<void> {
        if (this.runState === 'disposed') {
            throw new Error('Cannot restart a disposed EndlessSwordGame.');
        }
        if (context) {
            this.context = context;
        }
        // 策划案 §114：不重载 Bundle，清空重置后直接开始（新 runSeed）；
        // Runtime 在 restart 之后不会再调用 begin。
        this.startNewRun();
    }

    async dispose(): Promise<void> {
        this.cleanup();
    }

    protected onDestroy(): void {
        this.cleanup();
    }

    private cleanup(): void {
        if (this.runState === 'disposed') {
            return;
        }
        this.reportCurrentScore(true);
        this.runState = 'disposed';
        this.removeQaBridge();
        if (this.resizeListening) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeListening = false;
        }
        this.joystick?.dispose();
        this.joystick = undefined;
        this.clearCombatWorld();
        this.enemyView?.destroy();
        this.enemyView = undefined;
        this.projectileView?.destroy();
        this.projectileView = undefined;
        this.xpOrbView?.destroy();
        this.xpOrbView = undefined;
        this.playerView?.destroy();
        this.playerView = undefined;
        this.destroyNode(this.worldRoot);
        this.worldRoot = undefined;
        this.world = undefined;
        this.cameraRig = undefined;
        this.worldCamera = null;
        this.playerTexture = null;
        this.demonRatTexture = null;
        this.ghostFlameTexture = null;
        this.rottingCorpseTexture = null;
        this.crossbowPuppetTexture = null;
        this.loop = undefined;
        this.playerSystem = undefined;
        this.enemySystem = undefined;
        this.projectileSystem = undefined;
        this.xpOrbSystem = undefined;
        this.collisionSystem = undefined;
        this.destroyNode(this.hudRoot);
        this.hudRoot = undefined;
        this.survivalLabel = undefined;
        this.pauseButton = undefined;
        this.finishButton = undefined;
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
        this.enemySystem?.step(
            dt,
            this.model.player.x,
            this.model.player.y,
            this.emitEnemyProjectile,
        );
        this.projectileSystem?.step(dt);
        if (this.enemySystem && this.projectileSystem && this.collisionSystem) {
            this.collisionSystem.step(
                this.model.player,
                this.enemySystem,
                this.projectileSystem,
                this.handleEnemyKilled,
            );
            this.enemySystem.flushRetired((enemy) => this.enemyView?.hide(enemy.poolIndex));
            this.projectileSystem.flushExpired(
                (projectile) => this.projectileView?.hide(projectile.poolIndex),
            );
        }
        this.world?.update(this.model.player.x, this.model.player.y);
        this.reportCurrentScore();
        if (this.model.player.hp <= 0) {
            this.finishRun('defeated');
        }
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
        if (this.xpOrbView && this.xpOrbSystem) {
            this.xpOrbView.sync(this.xpOrbSystem);
        }
        if (this.enemyView && this.enemySystem) {
            this.enemyView.sync(this.enemySystem, alpha, frameSeconds);
        }
        if (this.projectileView && this.projectileSystem) {
            this.projectileView.sync(this.projectileSystem, alpha);
        }
        this.cameraRig?.follow(renderPos.x, renderPos.y);
        if (this.survivalLabel) {
            this.survivalLabel.string = `${formatSurvivalTime(this.model.gameplayElapsedTime)}`
                + `  HP ${Math.ceil(this.model.player.hp)}`;
        }
    }

    // ---- 世界与输入 ----

    private buildWorld(playerTexture?: Texture2D): void {
        const worldCamera = this.worldCamera;
        if (!worldCamera?.isValid || !worldCamera.node.isValid) {
            throw new Error('EndlessSword scene is missing its serialized WorldCamera.');
        }
        const worldRoot = new Node('World');
        worldRoot.layer = worldCamera.node.layer;
        this.node.addChild(worldRoot);
        this.worldRoot = worldRoot;

        this.world = new WorldBackground(worldRoot);
        this.world.setSeed(this.model.runSeed);
        this.world.update(0, 0);

        this.xpOrbView = new XpOrbView(worldRoot, ENDLESS_SWORD_CONFIG.pools.xpOrbs);
        this.enemyView = new EnemyView(worldRoot, ENDLESS_SWORD_CONFIG.pools.enemies, {
            'demon-rat': this.demonRatTexture ?? undefined,
            'ghost-flame': this.ghostFlameTexture ?? undefined,
            'rotting-corpse': this.rottingCorpseTexture ?? undefined,
            'crossbow-puppet': this.crossbowPuppetTexture ?? undefined,
        });
        this.projectileView = new ProjectileView(
            worldRoot,
            ENDLESS_SWORD_CONFIG.pools.projectiles,
        );
        this.playerView = new PlayerView(worldRoot, playerTexture);
        this.cameraRig = new CameraRig(worldRoot);
        this.playerView.setWorldPosition(0, 0);
    }

    private readonly emitEnemyProjectile = (
        x: number,
        y: number,
        dirX: number,
        dirY: number,
        speed: number,
        damage: number,
        lifetimeSeconds: number,
    ): void => {
        this.projectileSystem?.spawn(
            'enemy',
            x,
            y,
            dirX,
            dirY,
            speed,
            damage,
            lifetimeSeconds,
        );
    };

    private readonly handleEnemyKilled = (enemy: EnemyModel): void => {
        const config = getEnemyConfig(enemy.type);
        this.model.kills += 1;
        this.model.combatScore += config.score;
        this.xpOrbSystem?.spawn(enemy.x, enemy.y, config.xp);
    };

    private clearCombatWorld(): void {
        this.enemySystem?.clear((enemy) => this.enemyView?.hide(enemy.poolIndex));
        this.projectileSystem?.clear(
            (projectile) => this.projectileView?.hide(projectile.poolIndex),
        );
        this.xpOrbSystem?.clear((orb) => this.xpOrbView?.hide(orb.poolIndex));
        this.collisionSystem?.clear();
        this.enemyView?.resetAll();
        this.projectileView?.resetAll();
        this.xpOrbView?.resetAll();
    }

    // ---- 开发占位 UI ----

    private buildHud(): void {
        const visibleSize = view.getVisibleSize();

        const hud = new Node('Hud');
        hud.layer = this.node.layer;
        hud.addComponent(UITransform).setContentSize(visibleSize.width, visibleSize.height);
        this.node.addChild(hud);

        // 顶部中央生存时间。占位布局；正式 HUD 随 M1 的 Layout 模块落地。
        const survivalNode = new Node('SurvivalTime');
        survivalNode.layer = hud.layer;
        hud.addChild(survivalNode);
        survivalNode.addComponent(UITransform).setContentSize(
            240,
            ENDLESS_SWORD_CONFIG.ui.survivalLabelHeight,
        );
        this.survivalLabel = survivalNode.addComponent(Label);
        this.survivalLabel.string = '00:00';
        this.survivalLabel.fontSize = 38;
        this.survivalLabel.lineHeight = ENDLESS_SWORD_CONFIG.ui.survivalLabelHeight;
        this.survivalLabel.color = SW1_COLORS.gold;

        const pauseButton = this.createTextButton(
            'PauseButton',
            '暂停',
            ENDLESS_SWORD_CONFIG.ui.pauseButtonSize,
            ENDLESS_SWORD_CONFIG.ui.pauseButtonSize,
            26,
            SW1_COLORS.battlefield,
            SW1_COLORS.panel,
            () => this.context?.requestPause(),
        );
        hud.addChild(pauseButton);
        this.pauseButton = pauseButton;

        // 开发期按钮：验证结算链路，正式死亡接入后移除。
        const finishButton = this.createTextButton(
            'DevFinishButton',
            '结束本局（测试）',
            ENDLESS_SWORD_CONFIG.ui.devFinishButtonWidth,
            ENDLESS_SWORD_CONFIG.ui.devFinishButtonHeight,
            26,
            SW1_COLORS.battlefield,
            SW1_COLORS.danger,
            () => this.finishRun(),
        );
        hud.addChild(finishButton);
        finishButton.active = DEV;
        this.finishButton = finishButton;

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
        button.layer = this.node.layer;
        const transform = button.addComponent(UITransform);
        transform.setContentSize(width, height);

        // 一个节点只挂一个渲染组件：底板用 Graphics，文字放子节点，否则 Label 不渲染。
        const graphics = button.addComponent(Graphics);
        graphics.fillColor = background;
        graphics.roundRect(-width / 2, -height / 2, width, height, 12);
        graphics.fill();

        const labelNode = new Node('Label');
        labelNode.layer = button.layer;
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

    private startNewRun(): void {
        this.clearCombatWorld();
        this.model.reset(Date.now() >>> 0);
        this.world?.setSeed(this.model.runSeed);
        this.world?.update(0, 0);
        this.joystick?.setEnabled(true);
        this.loop?.reset();
        for (const spawn of T1_ENEMY_SHOWCASE) {
            this.enemySystem?.spawn(spawn.type, spawn.x, spawn.y);
        }
        this.renderFrame(0, 0);
        this.lastReportedScore = Number.NaN;
        this.nextScoreReportTime = ENDLESS_SWORD_CONFIG.loop.scoreReportIntervalSeconds;
        this.reportCurrentScore(true);
        if (this.hudRoot) {
            this.hudRoot.active = true;
        }
        this.runState = 'playing';
    }

    private finishRun(reason = 'dev-finish'): void {
        if (this.runState !== 'playing') {
            return;
        }
        this.runState = 'completed';
        this.joystick?.setEnabled(false);
        const result: GameResult = {
            score: this.model.totalScore,
            duration: Math.floor(this.model.gameplayElapsedTime * 1000),
            completed: true,
            extra: {
                reason,
                bossKills: 0,
                realm: '炼气',
                level: 1,
                kills: this.model.kills,
            },
        };
        this.reportCurrentScore(true);
        this.context?.requestExit(result);
    }

    private reportCurrentScore(force = false): void {
        const score = this.model.totalScore;
        if (!force && this.model.gameplayElapsedTime < this.nextScoreReportTime) {
            return;
        }
        if (!force && score === this.lastReportedScore) {
            return;
        }
        this.lastReportedScore = score;
        this.nextScoreReportTime = this.model.gameplayElapsedTime
            + ENDLESS_SWORD_CONFIG.loop.scoreReportIntervalSeconds;
        this.context?.reportScore(score);
    }

    private applyLayout(): void {
        const visibleSize = view.getVisibleSize();
        const layout = this.context?.services.platform.getLayoutInfo();
        this.hudRoot?.getComponent(UITransform)?.setContentSize(
            visibleSize.width,
            visibleSize.height,
        );
        this.joystick?.resize(visibleSize.width, visibleSize.height);

        const safeBounds = calculateVerticalSafeBounds(
            visibleSize.height,
            layout,
            ENDLESS_SWORD_CONFIG.ui.safeGap,
        );
        this.survivalLabel?.node.setPosition(
            0,
            safeBounds.topY
                - ENDLESS_SWORD_CONFIG.ui.survivalLabelHeight / 2
                - ENDLESS_SWORD_CONFIG.ui.safeGap,
            0,
        );
        const pausePosition = calculateTopRightControlPosition(
            visibleSize.width,
            visibleSize.height,
            layout,
            {
                controlWidth: ENDLESS_SWORD_CONFIG.ui.pauseButtonSize,
                controlHeight: ENDLESS_SWORD_CONFIG.ui.pauseButtonSize,
                rightInset: 24,
                defaultTopInset: 24,
                reservedGap: ENDLESS_SWORD_CONFIG.ui.safeGap,
            },
        );
        this.pauseButton?.setPosition(pausePosition.x, pausePosition.y, 0);
        this.finishButton?.setPosition(
            -visibleSize.width / 2 + ENDLESS_SWORD_CONFIG.ui.devFinishButtonLeftInset,
            safeBounds.bottomY
                + ENDLESS_SWORD_CONFIG.ui.devFinishButtonHeight / 2
                + ENDLESS_SWORD_CONFIG.ui.safeGap,
            0,
        );
    }

    private readonly handleCanvasResize = (): void => {
        if (this.runState !== 'disposed') {
            this.applyLayout();
        }
    };

    private destroyNode(target: Node | undefined): void {
        if (target && target.isValid) {
            target.destroy();
        }
    }

    // ---- QA 桥（随里程碑逐步补全至策划案 §120 全量命令）----

    private installQaBridge(): void {
        if (!DEV || typeof location === 'undefined') {
            return;
        }
        const host = globalThis as unknown as Record<string, unknown>;
        const bridge = Object.freeze({
            snapshot: (): unknown => this.createSnapshot(),
            start: (): void => {
                if (this.runState === 'ready') {
                    this.begin();
                }
            },
            finish: (): void => this.finishRun(),
            spawnEnemy: (type: EnemyType, x?: number, y?: number): number => {
                if (!isEnemyType(type)) {
                    return -1;
                }
                const enemy = this.enemySystem?.spawn(
                    type,
                    Number.isFinite(x) ? x as number : this.model.player.x + 220,
                    Number.isFinite(y) ? y as number : this.model.player.y,
                );
                return enemy?.poolIndex ?? -1;
            },
            damageEnemy: (poolIndex: number, damage = Number.MAX_SAFE_INTEGER): boolean => {
                const enemy = this.enemySystem?.getByPoolIndex(poolIndex);
                if (!enemy || !this.enemySystem || !this.collisionSystem) {
                    return false;
                }
                return this.collisionSystem.damageEnemy(
                    this.enemySystem,
                    enemy,
                    damage,
                    this.handleEnemyKilled,
                );
            },
            killAllEnemies: (): void => {
                const enemySystem = this.enemySystem;
                const collisionSystem = this.collisionSystem;
                if (!enemySystem || !collisionSystem) {
                    return;
                }
                enemySystem.forEachAlive((enemy) => {
                    collisionSystem.damageEnemy(
                        enemySystem,
                        enemy,
                        Number.MAX_SAFE_INTEGER,
                        this.handleEnemyKilled,
                    );
                });
            },
        });
        this.qaBridge = bridge;
        host.__ENDLESS_SWORD_QA__ = bridge;
    }

    private removeQaBridge(): void {
        const host = globalThis as unknown as Record<string, unknown>;
        if (host.__ENDLESS_SWORD_QA__ === this.qaBridge) {
            delete host.__ENDLESS_SWORD_QA__;
        }
        this.qaBridge = undefined;
    }

    private createSnapshot(): unknown {
        return Object.freeze({
            state: this.runState,
            runSeed: this.model.runSeed,
            gameplayElapsedTime: this.model.gameplayElapsedTime,
            survivalScore: this.model.survivalScore,
            combatScore: this.model.combatScore,
            totalScore: this.model.totalScore,
            kills: this.model.kills,
            player: Object.freeze({
                x: this.model.player.x,
                y: this.model.player.y,
                hp: this.model.player.hp,
                invincibilityRemaining: this.model.player.invincibilityRemaining,
            }),
            pools: Object.freeze({
                enemies: this.enemySystem?.stats,
                projectiles: this.projectileSystem?.stats,
                xpOrbs: this.xpOrbSystem?.stats,
            }),
            collision: Object.freeze({
                occupiedEnemyCells: this.collisionSystem?.occupiedCellCount ?? 0,
            }),
            visible: view.getVisibleSize(),
        });
    }
}

function isEnemyType(value: unknown): value is EnemyType {
    return typeof value === 'string'
        && (ENEMY_TYPES as readonly string[]).indexOf(value) >= 0;
}

function formatSurvivalTime(seconds: number): string {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);
    return `${pad(minutes)}:${pad(rest)}`;
}
