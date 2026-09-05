import {
    _decorator,
    assetManager,
    Canvas,
    Camera,
    Color,
    Component,
    DynamicAtlasManager,
    EventMouse,
    EventTouch,
    Graphics,
    JsonAsset,
    Label,
    Mask,
    Node,
    Rect,
    ScrollView,
    Sprite,
    SpriteFrame,
    Size,
    Texture2D,
    UIOpacity,
    UITransform,
    Vec3,
    tween,
    view,
} from 'cc';
import type { DevicePerformanceTier, GameResult, Unsubscribe } from '../../../core/types/CommonTypes';
import type { Platform } from '../../../platform/Platform';
import type {
    MiniGame,
    MiniGameContext,
    MiniGamePauseModel,
    MiniGameResultModel,
} from '../../../runtime/MiniGame';
import type { AdService } from '../../../services/ads/AdService';
import type { AnalyticsService } from '../../../services/analytics/AnalyticsService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    autoAtlasFrameName,
    loadAutoAtlasFrames,
} from '../../../services/asset/AutoAtlasLoader';
import {
    calculateVerticalSafeBounds,
} from '../../../shared/ui/PlatformSafeLayout';
import {
    DOODLE_JUMP_BUNDLE,
    DOODLE_JUMP_RESOURCE_BUNDLE,
    parseDoodleJumpGameplayConfig,
    type DoodleJumpGameplayConfig,
} from './DoodleJumpConfig';
import {
    DoodleJumpInputController,
    type DoodleJumpCalibrationResult,
} from './DoodleJumpInputController';
import {
    DoodleJumpSimulation,
    type DoodleJumpFailureReason,
} from './DoodleJumpSimulation';
import type {
    DoodleJumpCombatEvent,
    DoodleJumpEnemySnapshot,
} from './DoodleJumpCombatSystem';
import type {
    DoodleJumpHazardEvent,
    DoodleJumpHazardSnapshot,
} from './DoodleJumpHazardSystem';
import type {
    DoodleJumpFlightPower,
    DoodleJumpItemEvent,
    DoodleJumpItemSnapshot,
    DoodleJumpItemStatusSnapshot,
} from './DoodleJumpItemSystem';
import {
    buildDoodleJumpRunSave,
    readDoodleJumpSave,
    updateDoodleJumpSettings,
    writeDoodleJumpSave,
    type DoodleJumpActiveRound,
    type DoodleJumpRunHistoryBaseline,
    type DoodleJumpSaveState,
} from './DoodleJumpSave';
import { DoodleJumpStateMachine } from './DoodleJumpStateMachine';

const { ccclass } = _decorator;
const RUN_PROGRESS_SAVE_INTERVAL_SECONDS = 3;
const ENEMY_VISUAL_MARGIN_SCALE = 2;
// The beam source's top ring is 9.5 px right of its texture canvas center.
// Offset the runtime node so the visible ring, not the PNG bounds, aligns
// with the UFO's central lower pod.
const UFO_BEAM_VISUAL_CENTER_OFFSET_X = -11;

const COLORS = Object.freeze({
    paper: new Color(247, 241, 221, 255),
    paperOverlay: new Color(247, 241, 221, 228),
    teal: new Color(67, 154, 151, 255),
    tealDark: new Color(35, 92, 91, 255),
    coral: new Color(224, 105, 83, 255),
    ink: new Color(50, 54, 55, 255),
    muted: new Color(101, 105, 100, 255),
    platform: new Color(113, 183, 176, 255),
});

const TEXTURE_PATHS = Object.freeze({
    backgroundWarm: 'visual/backgrounds/parallax-v2/base-warm-tile/texture',
    backgroundSky: 'visual/backgrounds/parallax-v2/base-sky-tile/texture',
    backgroundCloud: 'visual/backgrounds/parallax-v2/base-cloud-tile/texture',
    backgroundStar: 'visual/backgrounds/parallax-v2/base-star-tile/texture',
    transitionWarmSky: 'visual/backgrounds/parallax-v2/transition-warm-sky/texture',
    transitionSkyCloud: 'visual/backgrounds/parallax-v2/transition-sky-cloud/texture',
    transitionCloudStar: 'visual/backgrounds/parallax-v2/transition-cloud-star/texture',
    decorWarmBinder: 'visual/backgrounds/decor-v2/warm-binder-clip/texture',
    decorWarmPushPin: 'visual/backgrounds/decor-v2/warm-push-pin/texture',
    decorWarmPaperclip: 'visual/backgrounds/decor-v2/warm-paperclip/texture',
    decorWarmPencilSpiral: 'visual/backgrounds/decor-v2/warm-pencil-spiral/texture',
    decorSkySun: 'visual/backgrounds/decor-v2/sky-sun/texture',
    decorSkyKite: 'visual/backgrounds/decor-v2/sky-kite/texture',
    decorSkyRainbow: 'visual/backgrounds/decor-v2/sky-rainbow/texture',
    decorSkyWind: 'visual/backgrounds/decor-v2/sky-wind/texture',
    decorCloudLightning: 'visual/backgrounds/decor-v2/cloud-lightning/texture',
    decorCloudRain: 'visual/backgrounds/decor-v2/cloud-rain/texture',
    decorCloudWarning: 'visual/backgrounds/decor-v2/cloud-warning-zigzag/texture',
    decorCloudMoonWind: 'visual/backgrounds/decor-v2/cloud-moon-wind/texture',
    decorStarConstellation: 'visual/backgrounds/decor-v2/star-constellation/texture',
    decorStarMoon: 'visual/backgrounds/decor-v2/star-moon/texture',
    decorStarPlanet: 'visual/backgrounds/decor-v2/star-planet/texture',
    decorStarComet: 'visual/backgrounds/decor-v2/star-comet/texture',
    playerJumping: 'visual/player/player-jumping-trimmed/texture',
    playerJetpack: 'visual/player/player-jetpack/texture',
    playerPropellerHatCap: 'visual/player/player-propeller-hat-cap/texture',
    playerPropellerHatBlades: 'visual/player/player-propeller-hat-blades/texture',
    playerRocket: 'visual/player/player-rocket/texture',
    shieldOverlay: 'visual/player/shield-overlay/texture',
    itemSpring: 'visual/items/pickup-spring-v2/texture',
    itemTrampoline: 'visual/items/pickup-trampoline/texture',
    itemJetpack: 'visual/items/pickup-jetpack/texture',
    itemPropellerHat: 'visual/items/pickup-propeller-hat/texture',
    itemRocket: 'visual/items/pickup-rocket/texture',
    itemShield: 'visual/items/pickup-shield/texture',
    itemPickupSparkles: 'visual/effects/item-pickup-sparkles/texture',
    playerFallDrag: 'visual/effects/player-fall-drag-streaks/texture',
    playerScreenWrap: 'visual/effects/player-screen-wrap-afterimages/texture',
    jetpackFlames: 'visual/effects/jetpack-flames/texture',
    jetpackScraps: 'visual/effects/jetpack-paper-scraps/texture',
    rocketFlame: 'visual/effects/rocket-flame/texture',
    rocketScraps: 'visual/effects/rocket-paper-scraps/texture',
    rocketTrail: 'visual/effects/rocket-paper-trail/texture',
    shieldPulse: 'visual/effects/shield-pulse/texture',
    resurrectionPulse: 'visual/effects/resurrection-pulse/texture',
    headStartBurst: 'visual/effects/head-start-burst/texture',
    springRebound: 'visual/effects/spring-rebound/texture',
    trampolineRebound: 'visual/effects/trampoline-rebound/texture',
    normalPlatform: 'visual/platforms/platform-normal-shadowed-v2/texture',
    movingPlatform: 'visual/platforms/platform-moving-shadowed-v2/texture',
    verticalMovingPlatform: 'visual/platforms/platform-vertical-moving-shadowed-v1/texture',
    spikedPlatform: 'visual/platforms/platform-spiked-shadowed-v1/texture',
    breakablePlatform: 'visual/platforms/platform-breakable-shadowed-v2/texture',
    breakableLeft: 'visual/platforms/platform-breakable-left/texture',
    breakableRight: 'visual/platforms/platform-breakable-right/texture',
    disappearingPlatform: 'visual/platforms/platform-disappearing-shadowed-v2/texture',
    shiftingPlatform: 'visual/platforms/platform-shifting-shadowed-v2/texture',
    explodingPlatform: 'visual/platforms/platform-exploding-shadowed-v2/texture',
    disappearingEffect: 'visual/platform-effects/disappearing-fade/texture',
    breakableCracksEffect: 'visual/platform-effects/breakable-cracks/texture',
    explosiveCountdownEffect: 'visual/platform-effects/explosive-countdown/texture',
    explosionFragmentsEffect: 'visual/platform-effects/explosion-fragments/texture',
    landingPaperDebris: 'visual/effects/landing-paper-debris-v3/texture',
    paperPlane: 'visual/projectiles/paper-plane-trimmed/texture',
    paperPlaneTrail: 'visual/projectiles/paper-plane-trail/texture',
    aimReticle: 'visual/projectiles/aim-reticle-trimmed/texture',
    enemySmall01: 'visual/enemies/enemy-small-01/texture',
    enemySmall02: 'visual/enemies/enemy-small-02/texture',
    enemyLarge01: 'visual/enemies/enemy-large-01/texture',
    enemyLarge02: 'visual/enemies/enemy-large-02/texture',
    enemyHover01: 'visual/enemies/enemy-hover-01/texture',
    enemyHover02: 'visual/enemies/enemy-hover-02/texture',
    enemyHitScratch: 'visual/effects/enemy-hit-scratch/texture',
    enemyDefeatFragments: 'visual/effects/enemy-defeat-fragments/texture',
    playerContactImpact: 'visual/effects/player-enemy-contact-impact/texture',
    ufo: 'visual/hazards/ufo/texture',
    ufoBeam: 'visual/hazards/ufo-beam/texture',
    ufoLockTarget: 'visual/hazards/ufo-lock-target/texture',
    ufoTether: 'visual/hazards/ufo-tether/texture',
    blackHoleRing: 'visual/hazards/black-hole-ring/texture',
    blackHoleCore: 'visual/hazards/black-hole-core/texture',
    bearTrap: 'visual/hazards/bear-trap/texture',
    bearTrapFlash: 'visual/hazards/bear-trap-flash/texture',
    failureUfoCapture: 'visual/effects/failure-ufo-capture/texture',
    failureBlackHoleSuction: 'visual/effects/failure-black-hole-suction/texture',
    failureBearTrapTrigger: 'visual/effects/failure-bear-trap-trigger/texture',
    failureFalling: 'visual/effects/failure-falling/texture',
    hudScoreCard: 'visual/ui/hud/score-card/texture',
    hudHeightCard: 'visual/ui/hud/height-card/texture',
    hudPauseButton: 'visual/ui/hud/pause-button/texture',
    hudRulesButton: 'visual/ui/hud/rules-button/texture',
    hudItemProgressFill: 'visual/ui/hud/item-progress-fill/texture',
    hudSensorErrorBar: 'visual/ui/hud/sensor-error-bar/texture',
    hudRetryButton: 'visual/ui/hud/retry-button/texture',
    hudBackButton: 'visual/ui/hud/back-button/texture',
    hudPlayAgainButton: 'visual/ui/hud/play-again-button/texture',
    panelLoading: 'visual/ui/panels/loading-panel/texture',
    panelSensorCalibration: 'visual/ui/panels/sensor-calibration-panel/texture',
    panelReady: 'visual/ui/panels/ready-panel/texture',
    panelPause: 'visual/ui/panels/pause-panel/texture',
    panelSensorError: 'visual/ui/panels/sensor-error-panel/texture',
    panelRevive: 'visual/ui/panels/revive-confirmation-panel/texture',
    panelResults: 'visual/ui/panels/results-panel/texture',
    panelRules: 'visual/ui/panels/rules-panel/texture',
    panelMissingResource: 'visual/ui/panels/missing-resource-panel/texture',
    tutorialSensorTilt: 'visual/ui/tutorial/sensor-tilt/texture',
    tutorialPaperPlane: 'visual/ui/tutorial/paper-plane-shot/texture',
    tutorialHazards: 'visual/ui/tutorial/hazard-symbols/texture',
    itemIconSpring: 'visual/ui/item-icons/spring/texture',
    itemIconTrampoline: 'visual/ui/item-icons/trampoline/texture',
    itemIconJetpack: 'visual/ui/item-icons/jetpack/texture',
    itemIconPropellerHat: 'visual/ui/item-icons/propeller-hat/texture',
    itemIconRocket: 'visual/ui/item-icons/rocket/texture',
    itemIconShield: 'visual/ui/item-icons/shield/texture',
    itemIconHeadStart: 'visual/ui/item-icons/head-start/texture',
});
const DOODLE_JUMP_REWARDED_VIDEO_ICON_PATH =
    'visual/ui/doodle-jump-rewarded-video-icon-v1/texture';
const DOODLE_JUMP_REWARDED_VIDEO_ICON_ASPECT = 120 / 85;
const DOODLE_JUMP_HUD_ATLAS_PATH = 'visual/ui/hud/doodle-hud';
const DOODLE_JUMP_ITEM_ICON_ATLAS_PATH = 'visual/ui/item-icons/doodle-item-icons';

type TextureKey = keyof typeof TEXTURE_PATHS;

function attachDoodleJumpAdIcon(
    parent: Node,
    frame: SpriteFrame | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
): Node | undefined {
    if (!frame) return undefined;
    const node = new Node('DoodleJumpRewardedVideoIcon');
    node.layer = parent.layer;
    node.setParent(parent);
    node.setPosition(x, y);
    node.addComponent(UITransform).setContentSize(width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    return node;
}

function measureDoodleJumpTextWidth(text: string, fontSize: number): number {
    let width = 0;
    for (const character of text) {
        if (character === ' ') width += fontSize * 0.35;
        else if (/^[\u0000-\u00ff]$/.test(character)) width += fontSize * 0.56;
        else width += fontSize;
    }
    return width;
}

function layoutDoodleJumpAdIconBeforeLabel(
    icon: Node | undefined,
    label: Label,
    text: string,
    fontSize: number,
    iconWidth: number,
    iconHeight: number,
    buttonWidth: number,
    gap = 4,
): void {
    if (!icon) return;
    const labelTransform = label.node.getComponent(UITransform);
    if (!labelTransform) return;
    const textWidth = Math.min(
        Math.max(fontSize, measureDoodleJumpTextWidth(text, fontSize)),
        Math.max(fontSize, buttonWidth - iconWidth - gap - 28),
    );
    const totalWidth = iconWidth + gap + textWidth;
    const centerY = label.node.position.y;
    labelTransform.setContentSize(textWidth, labelTransform.contentSize.height);
    label.node.setPosition((iconWidth + gap) / 2, centerY);
    icon.setPosition(-totalWidth / 2 + iconWidth / 2, centerY);
    icon.getComponent(UITransform)?.setContentSize(iconWidth, iconHeight);
}

const RULE_PAGES: readonly Readonly<{ title: string; body: string }>[] = Object.freeze([
    Object.freeze({
        title: '玩法规则',
        body: [
            '目标：控制主角不断向上攀登，获得更高的高度和分数。',
            '',
            '· 主角会自动连续跳跃，不能手动起跳。手机左右倾斜控制横向移动；角色越过屏幕左右边缘会从另一侧出现。',
            '· 点击任意方向发射纸飞机，按住可持续发射。纸飞机可攻击怪物，但不能破坏平台、道具或危险物。',
            '· 镜头只随最高进度向上移动。高度每增加 1 米获得 10 分，击败怪物和中断 UFO 还会获得额外分数。',
            '· 紫色升降平台会缓慢上下移动且越往高处越常见；星空背景开始出现倒刺平台，顶面可以踩，下方尖刺不能碰。',
            '· 没踩到下一块平台并掉出屏幕、碰到怪物、被 UFO 带走、进入黑洞核心或踩中捕兽夹都会失败。',
            '· 开启复活功能后，失败可通过激励广告复活；未配置广告位时复活直接成功。',
            '· 暂停、弹窗和切到后台时，角色、敌人、道具计时和世界运动都会暂停。',
        ].join('\n'),
    }),
    Object.freeze({
        title: '平台规则',
        body: [
            '平台只在主角下降时承接角色；上升过程中会从平台下方穿过。角色至少要有四分之一身体宽度落在平台上才算踩中。',
            '',
            '· 普通平台：固定不动，落地后正常反弹。',
            '· 移动平台：按自己的速度、方向和相位左右移动。',
            '· 断裂平台：从上方踩中后立即断成两半，不产生反弹。',
            '· 消失平台：第一次踩中会正常反弹，随后淡出并永久失去碰撞。',
            '· 变位平台：在三个位置之间移动，移动过程中仍可承接角色。',
            '· 爆炸平台：踩中后正常反弹，并开始 1.5 秒倒计时；爆炸后平台消失，但爆炸本身不会伤害角色。',
            '· 主路始终保证普通跳跃可以到达；一次性平台只作为两块主路平台之间的额外落脚点。',
        ].join('\n'),
    }),
    Object.freeze({
        title: '道具规则',
        body: [
            '可拾取道具带有常驻纸片星芒。主角碰到道具即可获得，纸飞机穿过道具不会触发拾取。',
            '',
            '· 弹簧：保存到下一次有效落地，使该次反弹明显升高。',
            '· 蹦床：同样在下一次有效落地触发，弹跳高度高于弹簧；蹦床会覆盖尚未使用的弹簧，起跳后主角翻滚两圈且在该次跳跃期间无敌。',
            '· 喷气背包：短时间保持向上飞行并穿过平台。',
            '· 竹蜻蜓：持续向上飞行，但仍保留平台碰撞。',
            '· 火箭：短时间高速向上冲刺并穿过平台。',
            '· 护盾：在持续时间内免疫怪物、UFO、黑洞核心和捕兽夹，不会因碰到一次危险就消失，但不能抵挡掉出屏幕。',
            '· 喷气背包、竹蜻蜓或火箭激活期间，三种飞行拾取物都不会被拾取、续时或替换；当前飞行结束后才能再次拾取。',
            '· 飞行道具激活期间角色免疫怪物和危险物，但掉出屏幕仍会失败。',
        ].join('\n'),
    }),
    Object.freeze({
        title: '敌人与危险',
        body: [
            '怪物可以用纸飞机攻击，也可以从上方向下踩踏。碰到怪物身体会失败，护盾、蹦床跳跃或飞行无敌生效时除外。',
            '',
            '· 小怪：体型较小、生命较低，会站在平台上活动。',
            '· 大怪：体型和碰撞范围更大，需要更多次命中。',
            '· 悬浮怪：漂浮在平台上方，不能通过踩踏击败。',
            '· UFO：先锁定角色，再用光束吸附；未及时击破会把角色带走。',
            '· 黑洞：外圈持续把角色拉向中心，进入核心后会被旋转吸入。',
            '· 捕兽夹：固定在平台上方，从上方踩中后触发失败。',
            '· 护盾、蹦床跳跃、喷气背包、竹蜻蜓和火箭生效期间，不会被上述敌人或危险物击败。',
            '· 所有怪物和危险物都在屏幕上方生成，再随世界自然进入画面。',
        ].join('\n'),
    }),
]);

const RULES_PANEL_HEIGHT = Math.round(590 * 4 / 3);

const BACKGROUND_THEME_BOUNDARIES = Object.freeze({
    sky: 114 + 250 * 100,
    cloud: 114 + 600 * 100,
    star: 114 + 950 * 100,
});

const SLICED_TEXTURE_KEYS: readonly TextureKey[] = Object.freeze([
    'panelLoading',
    'panelSensorCalibration',
    'panelReady',
    'panelPause',
    'panelSensorError',
    'panelRevive',
    'panelResults',
    'panelRules',
    'panelMissingResource',
]);

const REQUIRED_FORMAL_TEXTURES: readonly TextureKey[] = Object.freeze(
    Object.keys(TEXTURE_PATHS) as TextureKey[],
);

interface DoodleJumpProjectile {
    readonly node: Node;
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    remainingSeconds: number;
}

interface DoodleJumpCombatVisual {
    readonly node: Node;
    readonly kind: 'hit' | 'defeat';
    x: number;
    y: number;
    remainingSeconds: number;
    readonly durationSeconds: number;
}

interface DoodleJumpItemStatusSlot {
    readonly root: Node;
    readonly icon: Sprite;
    readonly track: Node;
    readonly fill: Node;
}

const LANDING_DEBRIS_DURATION = 0.42;
const TRAMPOLINE_ROTATION_TURNS = 2;
const PLAYER_CONTACT_IMPACT_DURATION = 0.38;
// Baked platform textures place the actual paper surface about 6 units below
// their logical top, while normalized enemy frames retain roughly 1.5 units of
// transparent bottom padding. Compensate both in presentation only so the
// collision body remains exactly anchored to the physical platform top.
const GROUND_ENEMY_VISIBLE_SURFACE_OFFSET = -7.5;

export interface DoodleJumpServices {
    readonly platform: Platform;
    readonly audio: AudioService;
    readonly feedback: FeedbackService;
    readonly storage: StorageService;
    readonly analytics: AnalyticsService;
    readonly ads: AdService;
    readonly deviceTier: DevicePerformanceTier;
}

@ccclass('DoodleJumpGame')
export class DoodleJumpGame extends Component implements MiniGame<DoodleJumpServices> {
    private readonly stateMachine = new DoodleJumpStateMachine();
    private context?: MiniGameContext<DoodleJumpServices>;
    private config?: DoodleJumpGameplayConfig;
    private simulation?: DoodleJumpSimulation;
    private inputController?: DoodleJumpInputController;
    private lifecycleGeneration = 0;
    private sessionStartedAt = 0;
    private failureLocked = false;
    private settlementCommitted = false;
    private successfulRevives = 0;
    private reviveActionLocked = false;
    private pendingFailure?: Readonly<{
        reason: DoodleJumpFailureReason;
        score: number;
    }>;
    private failureSnapshot?: ReturnType<DoodleJumpSimulation['getSnapshot']>;
    private sensorDegraded = false;
    private sensitivity: 0.75 | 1 | 1.25 = 1;
    private sensorInvert = false;
    private saveBaseline?: DoodleJumpSaveState;
    private runHistoryBaseline?: DoodleJumpSaveState;
    private activeRoundRestored = false;
    private debugHeadStartRemaining = 0;
    private runStarted = false;
    private runShotCount = 0;
    private runProgressSaveElapsed = 0;
    private runExitTracked = false;
    private rewardedVideoIconFrame?: SpriteFrame;
    private hideUnsubscribe?: Unsubscribe;
    private showUnsubscribe?: Unsubscribe;
    private resizeBound = false;
    private dynamicRoot?: Node;
    private uiCamera?: Camera;
    private backgroundRoot?: Node;
    private backgroundBaseNodes: Node[] = [];
    private backgroundDecorNodes: Node[] = [];
    private backgroundDecorSeedIndices: number[] = [];
    private backgroundDecorParallaxYs: number[] = [];
    private nextBackgroundDecorSeedIndex = 0;
    private worldRoot?: Node;
    private uiRoot?: Node;
    private overlayRoot?: Node;
    private flowOverlayRoot?: Node;
    private pauseOverlayRoot?: Node;
    private routeDebugNode?: Node;
    private playerNode?: Node;
    private playerMotionEffectNode?: Node;
    private playerWrapEffectNode?: Node;
    private playerJetpackNode?: Node;
    private playerRocketNode?: Node;
    private playerPropellerHatCapNode?: Node;
    private playerPropellerHatBladesNode?: Node;
    private playerPowerSecondaryEffectNode?: Node;
    private shieldPulseNode?: Node;
    private playerContactEffectNode?: Node;
    private playerContactEffectRemaining = 0;
    private landingDebrisRoot?: Node;
    private landingDebrisVisuals: Node[] = [];
    private platformNodes: Node[] = [];
    private platformNodeTypes: string[] = [];
    private enemyNodes: Node[] = [];
    private enemyNodeTypes: string[] = [];
    private hazardNodes: Node[] = [];
    private hazardNodeTypes: string[] = [];
    private itemNodes: Node[] = [];
    private itemNodeTypes: string[] = [];
    private shieldOverlayNode?: Node;
    private playerPowerEffectNode?: Node;
    private scoreLabel?: Label;
    private scoreCardNode?: Node;
    private heightCardNode?: Node;
    private itemStatusFrameNode?: Node;
    private itemStatusSlots: DoodleJumpItemStatusSlot[] = [];
    private itemEffectNode?: Node;
    private itemEffectRemaining = 0;
    private itemEffectDuration = 0.44;
    private itemEffectWorldX = 0;
    private itemEffectWorldY = 0;
    private itemEffectKey?: TextureKey;
    private flightPowerDropRoot?: Node;
    private flightPowerDropBodyNode?: Node;
    private flightPowerDropCapNode?: Node;
    private flightPowerDropBladesNode?: Node;
    private flightPowerDropType?: DoodleJumpFlightPower;
    private flightPowerDropElapsed = 0;
    private flightPowerDropWorldX = 0;
    private flightPowerDropWorldY = 0;
    private flightPowerDropVelocityX = 0;
    private flightPowerDropVelocityY = 0;
    private flightPowerDropRotation = 0;
    private flightPowerDropAngularVelocity = 0;
    private titleLabel?: Label;
    private statusLabel?: Label;
    private heightLabel?: Label;
    private debugLabel?: Label;
    private pauseButton?: Node;
    private rulesButton?: Node;
    private singleStepButton?: Node;
    private aimReticleNode?: Node;
    private attackPointerId?: number;
    private aimX = 0;
    private aimY = 1;
    private nextFireAt = 0;
    private activeProjectiles: DoodleJumpProjectile[] = [];
    private projectilePool: Node[] = [];
    private combatVisuals: DoodleJumpCombatVisual[] = [];
    private combatVisualPool: Node[] = [];
    private shotBatchCount = 0;
    private shotBatchStartedAt = 0;
    private lastReportedScore = -1;
    private activePauseModel?: MiniGamePauseModel;
    private activeResultModel?: MiniGameResultModel;
    private textureFrames: Partial<Record<TextureKey, SpriteFrame>> = {};
    private ownedFrames: SpriteFrame[] = [];
    private readonly slicedFrames = new Set<SpriteFrame>();
    private audioBank?: BundleAudioBank;
    private dynamicAtlasBaseline?: Readonly<{
        enabled: boolean;
        maxAtlasCount: number;
        maxFrameSize: number;
        textureSize: number;
        textureBleeding: boolean;
    }>;
    private missingRequiredVisuals: TextureKey[] = [];
    private tutorialActive = false;
    private tutorialStep = 0;
    private tutorialOpenedFromHud = false;
    private rulesOverlayActive = false;
    private rulesPageIndex = 0;
    private headStartPromptActive = false;
    private sensorCalibrationVisible = false;
    private missingResourceActive = false;
    private lastErrorMessage = '';
    private overlayButtons: Node[] = [];
    private pauseOverlayButtons: Node[] = [];
    private readonly disabledButtons = new Set<Node>();
    private lastButtonActionAt = 0;
    private lastPointerReleaseAt = 0;
    private lastTouchStartAt = 0;
    private mouseAttackHeld = false;
    private failureDelayPending = false;
    private failureDropActive = false;
    private failureDropElapsed = 0;
    private failureDropWorldX = 0;
    private failureDropWorldY = 0;
    private failureStartWorldX = 0;
    private failureStartWorldY = 0;
    private failureDropVelocityY = 0;
    private failureAnimationReason: DoodleJumpFailureReason = 'fall';
    private failureFocusWorldX = 0;
    private failureFocusWorldY = 0;
    private failureFocusHazardNode?: Node;
    private failureHazardEffectNode?: Node;
    private playerFacing: -1 | 1 = 1;
    private previousRenderedPlayerX?: number;
    private wrapEffectRemaining = 0;
    private observedLandingCount = 0;
    private landingDebrisRemaining = 0;
    private landingDebrisWorldX = 0;
    private landingDebrisWorldY = 0;

    async initialize(context: MiniGameContext<DoodleJumpServices>): Promise<void> {
        if (this.stateMachine.state !== 'Loading') {
            throw new Error(`Cannot initialize DoodleJumpGame from ${this.stateMachine.state}.`);
        }
        const initializeStartedAt = Date.now();
        this.assertSceneContract();
        this.context = context;
        const gameplayAsset = await this.loadJsonAsset('configs/gameplay');
        this.config = parseDoodleJumpGameplayConfig(gameplayAsset.json);
        this.configureDynamicAtlas();
        this.debugHeadStartRemaining = this.config.items.debugHeadStartCount;
        const saveLoad = readDoodleJumpSave(context.services.storage);
        this.saveBaseline = saveLoad.save;
        this.runHistoryBaseline = this.historyBaselineState(saveLoad.save);
        this.sensitivity = saveLoad.save.sensorSensitivity;
        this.sensorInvert = saveLoad.save.sensorInvert;
        const activeRound = saveLoad.save.activeRound;
        this.simulation = new DoodleJumpSimulation(
            this.config,
            activeRound?.snapshot.seed ?? (this.config.generation.seedOverride > 0
                ? this.config.generation.seedOverride
                : context.sessionId),
        );
        if (activeRound) {
            try {
                this.simulation.restore(activeRound.snapshot);
                this.runShotCount = activeRound.runShotCount;
                this.successfulRevives = Math.min(
                    this.config.resurrection.maximumSuccessfulRevives,
                    activeRound.successfulRevives,
                );
                this.observedLandingCount = activeRound.snapshot.landingCount;
                this.activeRoundRestored = true;
            } catch (error: unknown) {
                console.warn('[DoodleJumpGame] Ignored unrestorable active round.', error);
                const sanitized = Object.freeze({ ...saveLoad.save, activeRound: undefined });
                this.saveBaseline = sanitized;
                this.runHistoryBaseline = sanitized;
                writeDoodleJumpSave(context.services.storage, sanitized, true);
            }
        }
        this.inputController = new DoodleJumpInputController(
            context.services.platform,
            this.config,
        );
        this.hideUnsubscribe = context.services.platform.onHide(this.handlePlatformHide);
        this.showUnsubscribe = context.services.platform.onShow(this.handlePlatformShow);
        view.on('canvas-resize', this.handleCanvasResize, this);
        this.resizeBound = true;
        if (context.services.ads.isEnabledForGame(context.gameId)) {
            this.rewardedVideoIconFrame = await this.loadRewardedVideoIcon();
        }
        await this.preloadLoadingVisual();
        this.buildPresentation();
        this.setGameplayPresentationVisible(false);
        this.showLoadingOverlay();
        await this.loadVisualAssets();
        this.applyVisualAssets();
        this.setGameplayPresentationVisible(true);
        this.audioBank = new BundleAudioBank({
            bundle: DOODLE_JUMP_RESOURCE_BUNDLE,
            optionalMusic: 'audio/doodle-jump-paper-loop',
            cues: {},
            optionalCues: {
                uiButton: 'audio/ui-paper-button',
                fold: 'audio/paper-plane-shot',
                drop: 'audio/platform-land',
                collision: 'audio/impact',
                chain: 'audio/monster-defeat',
                milestone: 'audio/item-pickup',
                danger: 'audio/hazard-warning',
                failure: 'audio/run-failure',
                continue: 'audio/resurrection',
                record: 'audio/new-record',
            },
            logOptionalFailures: false,
        }, context.services.audio, context.services.feedback);
        await this.audioBank.initialize();
        if (this.missingRequiredVisuals.length === 0) this.destroyOverlay();
        context.services.analytics.track('doodle_jump_enter', {
            sessionId: context.sessionId,
            loadMs: Math.max(0, Date.now() - initializeStartedAt),
            bundleVersion: '0.1.0',
            saveMigrated: saveLoad.migrated,
            saveRecovered: saveLoad.recoveredFromFailure,
        });
        this.updatePresentationState('资源就绪');
    }

    begin(): void {
        if (this.stateMachine.state !== 'Loading') {
            throw new Error(`Cannot begin DoodleJumpGame from ${this.stateMachine.state}.`);
        }
        this.sessionStartedAt = this.activeRoundRestored
            ? Date.now() - Math.max(0, this.simulation?.getSnapshot().elapsedSeconds ?? 0) * 1000
            : Date.now();
        if (this.missingRequiredVisuals.length > 0) {
            this.stateMachine.transition('Error');
            this.showMissingResourceView();
            return;
        }
        this.stateMachine.transition('SensorCalibrating');
        this.updatePresentationState('请保持手机自然竖直');
        this.showSensorCalibrationOverlay();
        const generation = ++this.lifecycleGeneration;
        void this.inputController?.calibrate().then((result) => {
            if (!this.isGenerationCurrent(generation)
                || this.stateMachine.state !== 'SensorCalibrating') return;
            this.handleCalibrationResult(result);
        });
    }

    pause(): void {
        if (this.stateMachine.state !== 'Playing') return;
        this.persistCurrentRunHistory(false, true);
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        this.stateMachine.transition('Paused');
        this.context?.services.audio.pauseMusic();
        this.updatePresentationState('已暂停');
    }

    resume(): void {
        if (this.stateMachine.state !== 'Paused') return;
        this.stateMachine.transition('Playing');
        this.inputController?.setEnabled(true);
        this.context?.services.audio.resumeMusic();
        this.updatePresentationState(this.sensorDegraded ? '键盘开发控制' : '继续向上');
    }

    async restart(context?: MiniGameContext<DoodleJumpServices>): Promise<void> {
        if (this.stateMachine.state === 'Disposed') return;
        this.cancelAttack(true);
        this.persistCurrentRunHistory(false, true, undefined, undefined, false);
        this.trackExitOnce('restart');
        this.lifecycleGeneration += 1;
        this.unscheduleAllCallbacks();
        this.context = context ?? this.context;
        if (this.context) {
            const saveLoad = readDoodleJumpSave(this.context.services.storage);
            this.saveBaseline = saveLoad.save;
            this.runHistoryBaseline = saveLoad.save;
            this.sensitivity = saveLoad.save.sensorSensitivity;
            this.sensorInvert = saveLoad.save.sensorInvert;
        }
        this.runStarted = false;
        this.activeRoundRestored = false;
        this.runShotCount = 0;
        this.runProgressSaveElapsed = 0;
        this.runExitTracked = false;
        this.failureLocked = false;
        this.settlementCommitted = false;
        this.successfulRevives = 0;
        this.reviveActionLocked = false;
        this.pendingFailure = undefined;
        this.failureSnapshot = undefined;
        this.failureDelayPending = false;
        this.failureDropActive = false;
        this.failureDropElapsed = 0;
        this.failureAnimationReason = 'fall';
        this.failureFocusWorldX = 0;
        this.failureFocusWorldY = 0;
        this.failureFocusHazardNode = undefined;
        if (this.failureHazardEffectNode?.isValid) this.failureHazardEffectNode.active = false;
        this.playerContactEffectRemaining = 0;
        if (this.playerContactEffectNode?.isValid) this.playerContactEffectNode.active = false;
        this.playerFacing = 1;
        this.previousRenderedPlayerX = undefined;
        this.wrapEffectRemaining = 0;
        this.backgroundDecorSeedIndices = [];
        this.backgroundDecorParallaxYs = [];
        this.nextBackgroundDecorSeedIndex = 0;
        this.resetPlayerFailureVisual();
        this.observedLandingCount = 0;
        this.landingDebrisRemaining = 0;
        this.itemEffectRemaining = 0;
        this.tutorialActive = false;
        this.tutorialStep = 0;
        this.tutorialOpenedFromHud = false;
        this.rulesOverlayActive = false;
        this.rulesPageIndex = 0;
        this.headStartPromptActive = false;
        this.sensorCalibrationVisible = false;
        this.missingResourceActive = false;
        this.lastErrorMessage = '';
        this.debugHeadStartRemaining = this.config?.items.debugHeadStartCount ?? 0;
        this.clearCombatVisuals();
        this.lastReportedScore = -1;
        this.activePauseModel = undefined;
        this.activeResultModel = undefined;
        this.destroyOverlay();
        this.destroyPauseOverlay();
        this.resetShootingRuntime();
        this.simulation?.reset();
        this.renderSimulation();
        this.sessionStartedAt = Date.now();
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        if (this.stateMachine.state !== 'Loading') this.stateMachine.reset();
        this.begin();
        await Promise.resolve();
    }

    discardSavedProgress(): void {
        this.persistCurrentRunHistory(false, true, undefined, undefined, false);
        this.failureLocked = false;
    }

    async dispose(): Promise<void> {
        if (this.stateMachine.state === 'Disposed') return;
        this.cancelAttack(true);
        if (this.stateMachine.state === 'Failing'
            || this.stateMachine.state === 'ResurrectPrompt'
            || this.stateMachine.state === 'Resurrecting') {
            // 失败/复活状态已经在状态改变时写入活动局；销毁时只做最终
            // flush，避免用不可恢复状态覆盖掉失败或复活快照。
            try {
                this.context?.services.storage.flush();
            } catch (error: unknown) {
                console.error('[DoodleJumpGame] Storage flush failed on dispose.', error);
            }
        } else {
            this.persistCurrentRunHistory(false, true);
        }
        this.trackExitOnce('dispose');
        this.lifecycleGeneration += 1;
        this.inputController?.dispose();
        this.inputController = undefined;
        this.hideUnsubscribe?.();
        this.showUnsubscribe?.();
        this.hideUnsubscribe = undefined;
        this.showUnsubscribe = undefined;
        if (this.resizeBound) {
            view.off('canvas-resize', this.handleCanvasResize, this);
            this.resizeBound = false;
        }
        this.unscheduleAllCallbacks();
        this.failureDelayPending = false;
        this.node.off(Node.EventType.TOUCH_END, this.handleGameplayRelease, this);
        this.node.off(Node.EventType.TOUCH_START, this.handleGameplayTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.handleGameplayTouchMove, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.handleGameplayTouchCancel, this);
        this.node.off(Node.EventType.MOUSE_DOWN, this.handleGameplayMouseDown, this);
        this.node.off(Node.EventType.MOUSE_MOVE, this.handleGameplayMouseMove, this);
        this.node.off(Node.EventType.MOUSE_UP, this.handleGameplayMouseRelease, this);
        this.clearTextureReferences();
        this.audioBank?.dispose();
        this.audioBank = undefined;
        this.destroyPresentation();
        this.uiCamera = undefined;
        this.ownedFrames.forEach((frame) => {
            if (frame.isValid) frame.destroy();
        });
        this.ownedFrames = [];
        this.rewardedVideoIconFrame?.destroy();
        this.rewardedVideoIconFrame = undefined;
        this.slicedFrames.clear();
        this.restoreDynamicAtlas();
        this.textureFrames = {};
        this.context = undefined;
        this.config = undefined;
        this.simulation = undefined;
        if (this.stateMachine.canTransition('Disposed')) {
            this.stateMachine.transition('Disposed');
        }
        await Promise.resolve();
    }

    showPauseMenu(model: MiniGamePauseModel): void {
        this.cancelAttack(true);
        this.activePauseModel = model;
        if (this.rulesOverlayActive) {
            this.destroyPauseOverlay();
            this.showRulesPage();
            return;
        }
        if (this.tutorialOpenedFromHud && this.tutorialActive) {
            this.destroyPauseOverlay();
            this.showTutorialStep();
            return;
        }
        this.destroyPauseOverlay();
        const overlay = this.createOverlay(
            'PauseOverlay',
            '',
            '',
            'panelPause',
            'pause',
        );
        this.createButton(overlay, '继续', 0, 92, 300, 82, () => {
            void model.resume();
        }, 'primary');
        this.createButton(overlay, '重新开始', 0, -10, 300, 82, () => {
            void model.restart();
        }, 'danger');
        this.createButton(overlay, '返回大厅', 0, -112, 300, 82, () => {
            this.trackExitOnce('pause-lobby');
            void model.exit();
        }, 'secondary', 'hudBackButton');
    }

    hidePauseMenu(): void {
        this.activePauseModel = undefined;
        this.destroyPauseOverlay();
        if (this.rulesOverlayActive) {
            this.rulesOverlayActive = false;
            this.destroyOverlay();
        }
    }

    showResultView(model: MiniGameResultModel): void {
        this.activeResultModel = model;
        if (this.stateMachine.state === 'Failing') this.stateMachine.transition('Result');
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        this.destroyOverlay();
        const score = Math.max(0, Math.floor(model.result.score));
        const maxHeightMeters = Math.max(0, Math.floor(
            typeof model.result.extra?.maxHeightMeters === 'number'
                ? model.result.extra.maxHeightMeters
                : 0,
        ));
        const isNewBestScore = model.result.extra?.isNewBestScore === true;
        const resultMessage = `分数 ${score} · 高度 ${maxHeightMeters}m`;
        const overlay = this.createOverlay(
            'ResultOverlay',
            isNewBestScore ? '新的最高记录' : '本局结束',
            resultMessage,
            'panelResults',
        );
        this.createButton(overlay, '再来一局', 0, 5, 300, 82, () => {
            void model.restart();
        }, 'primary', 'hudPlayAgainButton');
        this.createButton(overlay, '返回大厅', 0, -105, 300, 82, () => {
            this.trackExitOnce('result-lobby');
            void model.returnToLobby();
        }, 'secondary', 'hudBackButton');
    }

    hideResultView(): void {
        this.activeResultModel = undefined;
        this.destroyOverlay();
    }

    update(deltaTime: number): void {
        if (this.stateMachine.state === 'Failing') {
            if (this.failureDropActive) this.updateFailureDrop(deltaTime);
            else if (this.pendingFailure) this.finishFailureDrop();
            return;
        }
        if (this.stateMachine.state !== 'Playing' || !this.config || !this.simulation) return;
        this.landingDebrisRemaining = Math.max(0, this.landingDebrisRemaining - deltaTime);
        this.itemEffectRemaining = Math.max(0, this.itemEffectRemaining - deltaTime);
        this.wrapEffectRemaining = Math.max(0, this.wrapEffectRemaining - deltaTime);
        this.updateCombatVisuals(deltaTime);
        this.updateFlightPowerDrop(deltaTime);
        const horizontal = this.inputController?.update(
            deltaTime,
            this.sensitivity,
            this.sensorInvert,
        ) ?? 0;
        const visible = view.getVisibleSize();
        // Existing bullets resolve before the fixed-step player contact pass so
        // a same-frame bullet hit always has the specified deterministic priority.
        this.updateShooting(deltaTime, visible.height);
        this.simulation.advance(deltaTime, horizontal, visible.height);
        this.captureLandingEffect(this.simulation.getSnapshot());
        this.consumeCombatEvents(this.simulation.drainCombatEvents());
        this.consumeHazardEvents(this.simulation.drainHazardEvents());
        this.consumeItemEvents(this.simulation.drainItemEvents());
        this.renderSimulation();
        this.runProgressSaveElapsed += Math.max(0, deltaTime);
        if (this.runProgressSaveElapsed >= RUN_PROGRESS_SAVE_INTERVAL_SECONDS) {
            // Each checkpoint is rebuilt from the immutable run baseline, so
            // repeated writes replace one another instead of double-counting.
            this.runProgressSaveElapsed = 0;
            this.persistCurrentRunHistory(false, false);
        }
        if (this.context?.services.platform.id === 'wechat'
            && this.inputController?.hasStaleSensor()) {
            this.enterSensorError('1500ms 内没有新的重力感应数据');
            return;
        }
        const fatalReason = this.simulation.takeFatalReason();
        if (fatalReason) this.tryFail(fatalReason);
        else if (this.simulation.isBelowDeathLine(visible.height)) this.tryFail('fall');
    }

    private assertSceneContract(): void {
        let current: Node | null = this.node;
        let canvas: Canvas | null = null;
        while (current && !canvas) {
            canvas = current.getComponent(Canvas);
            current = current.parent;
        }
        if (!canvas) throw new Error('DoodleJump scene is missing cc.Canvas.');
        if (!canvas.cameraComponent?.isValid) {
            throw new Error('DoodleJump Canvas must bind a valid UI Camera.');
        }
        this.uiCamera = canvas.cameraComponent;
        if (canvas.node.layer !== canvas.cameraComponent.node.layer) {
            throw new Error('DoodleJump Canvas and UI Camera must use the same layer.');
        }
    }

    private handleCalibrationResult(result: DoodleJumpCalibrationResult): void {
        this.context?.services.analytics.track('doodle_jump_sensor_ready', {
            sessionId: this.context.sessionId,
            sampleCount: result.sampleCount,
            calibrationMs: result.calibrationMs,
            degraded: result.degraded,
            mode: result.mode,
        });
        if (result.mode === 'error') {
            this.enterSensorError('未检测到重力感应，请重试');
            return;
        }
        this.sensorCalibrationVisible = false;
        this.destroyOverlay();
        this.sensorDegraded = result.degraded;
        if (this.saveBaseline?.tutorialCompleted !== true) {
            this.tutorialActive = true;
            this.tutorialStep = 0;
            this.showTutorialStep();
            return;
        }
        this.proceedAfterCalibration();
    }

    private proceedAfterCalibration(): void {
        if (this.stateMachine.state !== 'SensorCalibrating') return;
        if (this.activeRoundRestored
            || this.simulation?.getSnapshot().itemStatus.usedHeadStart) {
            this.startPlaying();
        } else if (this.availableHeadStartCount() > 0) {
            this.showHeadStartPrompt();
        } else {
            this.startPlaying();
        }
    }

    private showTutorialStep(): void {
        const validState = this.stateMachine.state === 'SensorCalibrating'
            || (this.tutorialOpenedFromHud && this.stateMachine.state === 'Paused');
        if (!validState || !this.tutorialActive) return;
        const steps = [
            Object.freeze({
                title: '第 1 步 · 倾斜移动',
                message: '左右倾斜手机控制角色\n拖动屏幕不会移动角色',
                texture: 'tutorialSensorTilt' as TextureKey,
            }),
            Object.freeze({
                title: '第 2 步 · 发射纸飞机',
                message: '点击发射一架纸飞机\n按住会持续发射',
                texture: 'tutorialPaperPlane' as TextureKey,
            }),
            Object.freeze({
                title: '第 3 步 · 躲避危险',
                message: '踩怪物，躲开光束、黑洞和捕兽夹',
                texture: 'tutorialHazards' as TextureKey,
            }),
        ] as const;
        const step = steps[Math.max(0, Math.min(steps.length - 1, this.tutorialStep))];
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'TutorialOverlay',
            step.title,
            step.message,
            'panelReady',
        );
        const frame = this.textureFrames[step.texture];
        if (frame) this.createSpriteNode(overlay, 'TutorialIllustration', frame, 250, 176, 0, 18);
        this.createButton(
            overlay,
            this.tutorialStep >= steps.length - 1 ? '开始游戏' : '下一步',
            80,
            -205,
            250,
            76,
            () => {
                if (this.tutorialStep < steps.length - 1) {
                    this.tutorialStep += 1;
                    this.showTutorialStep();
                } else {
                    this.completeTutorial();
                }
            },
        );
        this.createButton(overlay, '我知道了', -155, -205, 150, 70, () => {
            this.completeTutorial();
        }, 'secondary');
    }

    private completeTutorial(): void {
        const openedFromHud = this.tutorialOpenedFromHud;
        const validState = this.stateMachine.state === 'SensorCalibrating'
            || (openedFromHud && this.stateMachine.state === 'Paused');
        if (!this.tutorialActive || !validState) return;
        const context = this.context;
        const baseline = this.saveBaseline;
        if (!openedFromHud && context && baseline) {
            const next = updateDoodleJumpSettings(baseline, { tutorialCompleted: true });
            try {
                writeDoodleJumpSave(context.services.storage, next, true);
                this.saveBaseline = next;
            } catch (error: unknown) {
                console.error('[DoodleJumpGame] Failed to persist tutorial completion.', error);
            }
        }
        this.tutorialActive = false;
        this.tutorialOpenedFromHud = false;
        this.destroyOverlay();
        if (openedFromHud) {
            const pauseModel = this.activePauseModel;
            if (pauseModel) void pauseModel.resume();
            return;
        }
        this.proceedAfterCalibration();
    }

    private openTutorialFromHud(): void {
        if (this.stateMachine.state !== 'Playing') return;
        this.tutorialOpenedFromHud = true;
        this.tutorialActive = true;
        this.tutorialStep = 0;
        this.context?.requestPause();
    }

    private openRulesFromHud(): void {
        if (this.stateMachine.state !== 'Playing') return;
        this.rulesOverlayActive = true;
        this.rulesPageIndex = 0;
        this.context?.requestPause();
    }

    private showRulesPage(animatePanel = true): void {
        if (!this.rulesOverlayActive || this.stateMachine.state !== 'Paused') return;
        const page = RULE_PAGES[this.rulesPageIndex];
        if (!page) return;
        this.destroyOverlay();
        const panel = this.createOverlay(
            'RulesOverlay',
            page.title,
            '',
            'panelRules',
            'flow',
            animatePanel,
            RULES_PANEL_HEIGHT,
        );
        const panelWidth = panel.getComponent(UITransform)?.contentSize.width ?? 520;
        const panelHeight = panel.getComponent(UITransform)?.contentSize.height
            ?? RULES_PANEL_HEIGHT;
        this.createLabel(
            panel,
            'RulesPager',
            `${this.rulesPageIndex + 1} / ${RULE_PAGES.length}  ·  上下滑动查看  ·  左右滑动翻页`,
            0,
            panelHeight / 2 - 138,
            18,
            COLORS.muted,
            panelWidth - 100,
            32,
        );

        const viewportWidth = panelWidth - 82;
        const viewportHeight = panelHeight - 297;
        const viewport = new Node('RulesScrollViewport');
        viewport.layer = this.node.layer;
        viewport.setParent(panel);
        viewport.setPosition(0, -18, 0);
        viewport.addComponent(UITransform).setContentSize(viewportWidth, viewportHeight);
        const mask = viewport.addComponent(Mask);
        mask.type = Mask.Type.GRAPHICS_RECT;

        const fontSize = 24;
        const lineHeight = 38;
        const bodyTextWidth = viewportWidth - 38;
        const bodyHeight = this.estimateRulesTextHeight(
            page.body,
            fontSize,
            lineHeight,
            bodyTextWidth,
            viewportHeight + 20,
        );
        const body = new Node('RulesScrollBody');
        body.layer = this.node.layer;
        body.setParent(viewport);
        body.addComponent(UITransform).setContentSize(viewportWidth - 20, bodyHeight);
        body.getComponent(UITransform)!.setAnchorPoint(0.5, 1);
        body.setPosition(0, viewportHeight / 2, 0);
        const label = this.createLabel(
            body,
            'RulesBody',
            page.body,
            0,
            -14,
            fontSize,
            COLORS.ink,
            bodyTextWidth,
            bodyHeight - 28,
        );
        label.horizontalAlign = 0;
        label.verticalAlign = 0;
        label.overflow = Label.Overflow.CLAMP;
        label.lineHeight = lineHeight;
        label.node.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
        label.node.setPosition(0, -14, 0);

        const scrollView = viewport.addComponent(ScrollView);
        scrollView.content = body;
        scrollView.horizontal = false;
        scrollView.vertical = true;
        scrollView.inertia = true;
        scrollView.brake = 0.75;
        scrollView.elastic = true;
        scrollView.cancelInnerEvents = true;

        let swipeStartX = 0;
        let swipeStartY = 0;
        panel.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const point = event.getUILocation();
            swipeStartX = point.x;
            swipeStartY = point.y;
        }, this, true);
        panel.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            const point = event.getUILocation();
            const deltaX = point.x - swipeStartX;
            const deltaY = point.y - swipeStartY;
            if (Math.abs(deltaX) > 76 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
                this.changeRulesPage(deltaX < 0 ? 1 : -1);
            }
        }, this, true);

        const footerY = -panelHeight / 2 + 69;
        this.createButton(panel, '‹ 上一页', -170, footerY, 140, 62, () => {
            this.changeRulesPage(-1);
        }, 'secondary');
        this.createButton(panel, '关闭', 0, footerY, 140, 62, () => {
            this.closeRulesOverlay();
        }, 'primary');
        this.createButton(panel, '下一页 ›', 170, footerY, 140, 62, () => {
            this.changeRulesPage(1);
        }, 'secondary');
    }

    private changeRulesPage(delta: -1 | 1): void {
        if (!this.rulesOverlayActive) return;
        this.rulesPageIndex = (
            this.rulesPageIndex + delta + RULE_PAGES.length
        ) % RULE_PAGES.length;
        this.showRulesPage(false);
    }

    private closeRulesOverlay(): void {
        if (!this.rulesOverlayActive) return;
        this.rulesOverlayActive = false;
        this.destroyOverlay();
        const pauseModel = this.activePauseModel;
        if (pauseModel) void pauseModel.resume();
    }

    private estimateRulesTextHeight(
        text: string,
        fontSize: number,
        lineHeight: number,
        width: number,
        minimumHeight: number,
    ): number {
        const charactersPerLine = Math.max(8, Math.floor(width / Math.max(1, fontSize)));
        const lineCount = text.split('\n').reduce((total, paragraph) => (
            total + Math.max(1, Math.ceil(paragraph.length / charactersPerLine))
        ), 0);
        return Math.max(minimumHeight, lineCount * lineHeight + 36);
    }

    private availableHeadStartCount(): number {
        return Math.max(0, this.saveBaseline?.headStartCount ?? 0)
            + Math.max(0, this.debugHeadStartRemaining);
    }

    private showHeadStartPrompt(): void {
        if (this.stateMachine.state !== 'SensorCalibrating') return;
        const count = this.availableHeadStartCount();
        if (count <= 0) {
            this.startPlaying();
            return;
        }
        this.headStartPromptActive = true;
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'HeadStartOverlay',
            '起步助推',
            `当前拥有 ${count} 次，本局只能使用一次`,
            'panelReady',
        );
        this.createButton(overlay, '使用起步助推', 0, 15, 320, 86, () => {
            this.useHeadStartAndPlay();
        });
        this.createButton(overlay, '直接开始', 0, -95, 320, 86, () => {
            this.headStartPromptActive = false;
            this.destroyOverlay();
            this.startPlaying();
        });
    }

    private useHeadStartAndPlay(): void {
        if (this.stateMachine.state !== 'SensorCalibrating'
            || this.availableHeadStartCount() <= 0) return;
        const baseline = this.saveBaseline;
        const context = this.context;
        if (baseline && context && baseline.headStartCount > 0) {
            const next = updateDoodleJumpSettings(baseline, {
                headStartCount: baseline.headStartCount - 1,
            });
            try {
                writeDoodleJumpSave(context.services.storage, next, true);
                this.saveBaseline = next;
            } catch (error: unknown) {
                console.error('[DoodleJumpGame] Failed to consume Head Start.', error);
                this.updatePresentationState('起步助推保存失败，请重试');
                return;
            }
        } else {
            this.debugHeadStartRemaining = Math.max(0, this.debugHeadStartRemaining - 1);
        }
        this.simulation?.activateHeadStart();
        this.headStartPromptActive = false;
        this.destroyOverlay();
        this.startPlaying();
    }

    private startPlaying(): void {
        if (this.stateMachine.state !== 'SensorCalibrating') return;
        this.tutorialActive = false;
        this.headStartPromptActive = false;
        this.sensorCalibrationVisible = false;
        this.stateMachine.transition('Playing');
        this.inputController?.setEnabled(true);
        this.runStarted = true;
        this.runProgressSaveElapsed = 0;
        const snapshot = this.simulation?.getSnapshot();
        this.context?.services.analytics.track('doodle_jump_run_start', {
            sessionId: this.context.sessionId,
            seed: snapshot?.seed ?? 0,
            sensorInvert: this.sensorInvert,
            usedHeadStart: snapshot?.itemStatus.usedHeadStart ?? false,
            resumed: this.activeRoundRestored,
        });
        this.updatePresentationState(this.activeRoundRestored
            ? '已恢复上次进度'
            : this.sensorDegraded ? '键盘开发控制' : '左右倾斜控制移动');
    }

    private tryFail(reason: DoodleJumpFailureReason): void {
        if (this.stateMachine.state !== 'Playing'
            || this.failureLocked
            || this.settlementCommitted) return;
        this.failureLocked = true;
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        const snapshot = this.simulation?.getSnapshot();
        this.failureSnapshot = snapshot;
        const score = this.calculateScore(
            snapshot?.maxAbsoluteWorldY ?? 0,
            (snapshot?.combat.score ?? 0) + (snapshot?.hazardStats.score ?? 0),
        );
        // 失败快照是跨生命周期边界的关键状态：先在仍可构建 activeRound 的
        // Playing 状态同步写盘，再切换到 Failing，避免死亡后立即退出时只剩
        // 上一次 3 秒检查点。
        this.persistCurrentRunHistory(false, true, undefined, snapshot);
        this.runProgressSaveElapsed = 0;
        this.stateMachine.transition('Failing');
        this.context?.services.feedback.play('failure');
        this.updatePresentationState(this.failureReasonText(reason));
        if (snapshot && this.config?.generation.exportFailureDebug) {
            // 预留失败诊断出口，当前不打印日志。
        }
        this.context?.services.analytics.track('doodle_jump_fail', {
            sessionId: this.context.sessionId,
            failureReason: reason,
            score,
            heightMeters: this.calculateHeightMeters(snapshot?.maxAbsoluteWorldY ?? 0),
            seed: snapshot?.seed ?? 0,
            generatorCursor: snapshot?.generatorCursor ?? 0,
            degradedGenerationCount: snapshot?.degradedGenerationCount ?? 0,
            lastLandedPlatformId: snapshot?.lastLandedPlatformId ?? '',
            killCount: snapshot?.combat.killCount ?? 0,
            stompCount: snapshot?.combat.stompCount ?? 0,
            hitCount: snapshot?.combat.hitCount ?? 0,
            ufoInterruptCount: snapshot?.hazardStats.ufoInterruptCount ?? 0,
        });
        this.pendingFailure = Object.freeze({ reason, score });
        if (reason === 'monster-contact') this.startPlayerContactEffect();
        this.beginFailureDrop(reason, snapshot);
    }

    private beginFailureDrop(
        reason: DoodleJumpFailureReason,
        snapshot: ReturnType<DoodleJumpSimulation['getSnapshot']> | undefined,
    ): void {
        if (!this.config) return;
        this.failureDropActive = true;
        this.failureDelayPending = true;
        this.failureDropElapsed = 0;
        this.failureAnimationReason = reason;
        this.failureDropWorldX = snapshot?.playerX ?? this.config.design.width / 2;
        this.failureDropWorldY = snapshot?.playerY
            ?? this.simulation?.getCameraBottomY()
            ?? 0;
        this.failureStartWorldX = this.failureDropWorldX;
        this.failureStartWorldY = this.failureDropWorldY;
        // Contact while rising must still turn into an immediate downward fall.
        // Existing downward speed is preserved when it is already faster.
        this.failureDropVelocityY = Math.min(snapshot?.velocityY ?? 0, -360);
        this.failureFocusWorldX = snapshot?.fatalFocusX ?? this.failureDropWorldX;
        this.failureFocusWorldY = snapshot?.fatalFocusY ?? this.failureDropWorldY;
        this.failureFocusHazardNode = undefined;
        if (reason === 'black-hole' && snapshot) {
            const focusIndex = snapshot.hazards.findIndex((hazard) => (
                hazard.type === 'black-hole'
                && Math.abs(hazard.x - this.failureFocusWorldX) < 0.01
                && Math.abs(hazard.y - this.failureFocusWorldY) < 0.01
            ));
            if (focusIndex >= 0) this.failureFocusHazardNode = this.hazardNodes[focusIndex];
        }
        this.startHazardFailureEffect(reason);
    }

    private updateFailureDrop(deltaTime: number): void {
        if (!this.failureDropActive || !this.config || !this.simulation) return;
        const safeDelta = Number.isFinite(deltaTime)
            ? Math.max(0, Math.min(0.05, deltaTime))
            : 0;
        this.failureDropElapsed += safeDelta;
        this.updatePlayerContactEffect(safeDelta);
        this.updateHazardFailureEffect();
        const visible = view.getVisibleSize();
        const cameraBottomY = this.simulation.getCameraBottomY();
        const cameraCenterY = cameraBottomY + visible.height / 2;
        const playerOpacity = this.playerNode?.getComponent(UIOpacity)
            ?? this.playerNode?.addComponent(UIOpacity);
        let animationFinished = false;
        if (this.failureAnimationReason === 'ufo-abduction') {
            const progress = Math.min(1, this.failureDropElapsed / 0.72);
            const eased = 1 - Math.pow(1 - progress, 2);
            this.failureDropWorldX = this.failureStartWorldX
                + (this.failureFocusWorldX - this.failureStartWorldX) * eased;
            this.failureDropWorldY = this.failureStartWorldY
                + (this.failureFocusWorldY - this.failureStartWorldY + 48) * eased;
            const scale = Math.max(0.08, 1 - eased * 0.88);
            this.playerNode?.setScale(scale, scale, 1);
            if (playerOpacity) playerOpacity.opacity = Math.max(0, Math.round(255 * (1 - progress)));
            animationFinished = progress >= 1;
        } else if (this.failureAnimationReason === 'black-hole') {
            const progress = Math.min(1, this.failureDropElapsed / 0.9);
            const radialProgress = 1 - Math.pow(1 - progress, 2.2);
            const remainingRadius = 1 - radialProgress;
            const startOffsetX = this.failureStartWorldX - this.failureFocusWorldX;
            const startOffsetY = this.failureStartWorldY - this.failureFocusWorldY;
            const spiralAngle = progress * Math.PI * 1.15;
            const cosine = Math.cos(spiralAngle);
            const sine = Math.sin(spiralAngle);
            this.failureDropWorldX = this.failureFocusWorldX
                + (startOffsetX * cosine - startOffsetY * sine) * remainingRadius;
            this.failureDropWorldY = this.failureFocusWorldY
                + (startOffsetX * sine + startOffsetY * cosine) * remainingRadius;
            const shrinkProgress = Math.max(0, (progress - 0.08) / 0.92);
            const scale = Math.max(0.025, 1 - shrinkProgress * 0.975);
            this.playerNode?.setScale(scale, scale, 1);
            this.playerNode?.setRotationFromEuler(0, 0, progress * 390);
            const fadeProgress = Math.max(0, (progress - 0.72) / 0.28);
            if (playerOpacity) {
                playerOpacity.opacity = Math.max(0, Math.round(255 * (1 - fadeProgress)));
            }
            animationFinished = progress >= 1;
        } else {
            const trapHold = this.failureAnimationReason === 'bear-trap' ? 0.24 : 0;
            if (this.failureDropElapsed > trapHold) {
                this.failureDropVelocityY += this.config.player.gravity * safeDelta;
                this.failureDropWorldY += this.failureDropVelocityY * safeDelta;
            }
            if (playerOpacity) playerOpacity.opacity = 255;
        }
        this.playerNode?.setPosition(
            this.failureDropWorldX - this.config.design.width / 2,
            this.failureDropWorldY - cameraCenterY,
            0,
        );
        if (this.playerNode?.isValid && this.worldRoot?.isValid) {
            this.playerNode.setSiblingIndex(Math.max(0, this.worldRoot.children.length - 1));
        }
        if (this.failureAnimationReason === 'black-hole'
            && this.failureFocusHazardNode?.isValid
            && this.worldRoot?.isValid) {
            // The black-hole ring and core must cover the shrinking player at
            // the end of the spiral so the character visibly enters the hole.
            this.failureFocusHazardNode.setSiblingIndex(
                Math.max(0, this.worldRoot.children.length - 1),
            );
        }
        const playerTopY = this.failureDropWorldY + this.config.player.collisionHeight / 2;
        const fullyBelowScreen = playerTopY < cameraBottomY - 8;
        if (animationFinished
            || (fullyBelowScreen && this.failureDropElapsed >= 0.08)
            || this.failureDropElapsed >= 1.35) {
            this.finishFailureDrop();
        }
    }

    private finishFailureDrop(): void {
        if (this.stateMachine.state !== 'Failing') return;
        this.failureDropActive = false;
        this.failureDelayPending = false;
        this.failureFocusHazardNode = undefined;
        if (this.failureHazardEffectNode?.isValid) this.failureHazardEffectNode.active = false;
        const failure = this.pendingFailure;
        if (!failure) return;
        const reviveEnabled = this.context?.services.ads.isEnabledForGame(
            this.context.gameId,
        ) === true;
        const maximumRevives = this.config?.resurrection.maximumSuccessfulRevives ?? 0;
        if (!reviveEnabled || this.successfulRevives >= maximumRevives) {
            this.commitResult(failure.reason, failure.score);
            return;
        }
        this.showResurrectionPrompt();
    }

    private showResurrectionPrompt(_message?: string): void {
        if (this.settlementCommitted
            || (this.stateMachine.state !== 'Failing'
                && this.stateMachine.state !== 'ResurrectPrompt')) return;
        if (this.stateMachine.state === 'Failing') this.stateMachine.transition('ResurrectPrompt');
        this.reviveActionLocked = false;
        this.destroyOverlay();
        const heightMeters = this.calculateHeightMeters(
            this.failureSnapshot?.maxAbsoluteWorldY ?? 0,
        );
        const score = this.pendingFailure?.score ?? 0;
        const overlay = this.createOverlay(
            'ResurrectionOverlay',
            '还能继续向上',
            `分数 ${score} · 高度 ${heightMeters}m`,
            'panelRevive',
        );
        const reviveButton = this.createButton(
            overlay,
            '看广告复活',
            0,
            65,
            320,
            82,
            () => {
                void this.requestResurrection();
            },
            'primary',
            undefined,
            true,
        );
        const restartButton = this.createButton(overlay, '重新开始', 0, -35, 320, 82, () => {
            this.context?.requestRestart();
        }, 'danger');
        const finishButton = this.createButton(overlay, '结束本局', 0, -135, 320, 82, () => {
            const failure = this.pendingFailure;
            if (failure) this.commitResult(failure.reason, failure.score);
        }, 'secondary', 'hudBackButton');
        if (this.reviveActionLocked) {
            this.setButtonEnabled(reviveButton, false);
            this.setButtonEnabled(restartButton, false);
            this.setButtonEnabled(finishButton, false);
        }
    }

    private async requestResurrection(): Promise<void> {
        if (this.stateMachine.state !== 'ResurrectPrompt'
            || this.reviveActionLocked
            || !this.context
            || !this.config) return;
        this.reviveActionLocked = true;
        this.setOverlayButtonsEnabled(false);
        const override = this.config.resurrection.debugRewardedOutcome;
        const result = override === 'auto'
            ? await this.context.services.ads.showRewarded({
                placement: this.config.resurrection.placement,
                gameId: this.context.gameId,
                sessionId: this.context.sessionId,
            })
            : Object.freeze({ outcome: override });
        if (this.stateMachine.state !== 'ResurrectPrompt') return;
        if (result.outcome !== 'completed') {
            this.reviveActionLocked = false;
            this.showResurrectionPrompt(
                result.outcome === 'skipped' ? '广告未完整观看，可以重试' : '广告暂不可用，可以重试',
            );
            return;
        }
        if (this.stateMachine.state !== 'ResurrectPrompt') return;
        this.stateMachine.transition('Resurrecting');
        this.destroyOverlay();
        this.resetShootingRuntime();
        const failureReason = this.pendingFailure?.reason ?? 'fall';
        const failureHeightMeters = this.calculateHeightMeters(
            this.failureSnapshot?.maxAbsoluteWorldY ?? 0,
        );
        const resurrection = this.simulation?.resurrect(view.getVisibleSize().height);
        this.successfulRevives += 1;
        this.failureLocked = false;
        this.reviveActionLocked = false;
        this.pendingFailure = undefined;
        this.failureSnapshot = undefined;
        this.resetPlayerFailureVisual();
        this.context.services.analytics.track('doodle_jump_resurrect', {
            sessionId: this.context.sessionId,
            failureReason,
            heightMeters: failureHeightMeters,
            reviveIndex: this.successfulRevives,
            source: 'rewarded-ad',
            safePlatformGenerated: resurrection?.safePlatformGenerated ?? false,
            platformId: resurrection?.platformId ?? '',
        });
        this.stateMachine.transition('Playing');
        this.runProgressSaveElapsed = 0;
        const revived = this.simulation?.getSnapshot();
        // 复活会重置位置、速度、附近危险物和护盾，必须把这个新局面立即
        // 固化，不能等下一次 3 秒检查点。
        this.persistCurrentRunHistory(false, true, undefined, revived);
        this.inputController?.setEnabled(true);
        this.context.services.feedback.play('continue');
        if (revived) this.startItemEffect(
            'resurrectionPulse',
            revived.playerX,
            revived.playerY,
            0.62,
        );
        this.updatePresentationState('复活成功，继续向上');
    }

    private commitResult(reason: DoodleJumpFailureReason, score: number): void {
        if (this.settlementCommitted
            || (this.stateMachine.state !== 'Failing'
                && this.stateMachine.state !== 'ResurrectPrompt')) return;
        this.settlementCommitted = true;
        this.reviveActionLocked = true;
        this.destroyOverlay();
        if (this.stateMachine.canTransition('Result')) this.stateMachine.transition('Result');
        const snapshot = this.failureSnapshot ?? this.simulation?.getSnapshot();
        const maxHeightMeters = this.calculateHeightMeters(snapshot?.maxAbsoluteWorldY ?? 0);
        const killCount = snapshot?.combat.killCount ?? 0;
        const runDurationMs = Math.max(0, Date.now() - this.sessionStartedAt);
        const isNewBestScore = this.persistCurrentRunHistory(
            true,
            true,
            score,
            snapshot,
        );
        if (isNewBestScore) this.context?.services.feedback.play('record');
        this.context?.services.analytics.track('doodle_jump_result', {
            sessionId: this.context.sessionId,
            score,
            heightMeters: maxHeightMeters,
            killCount,
        });
        const result: GameResult = Object.freeze({
            score,
            duration: runDurationMs,
            completed: true,
            extra: Object.freeze({
                failureReason: reason,
                successfulRevives: this.successfulRevives,
                maxHeightMeters,
                killCount,
                smallMonsterKills: snapshot?.combat.smallMonsterKills ?? 0,
                largeMonsterKills: snapshot?.combat.largeMonsterKills ?? 0,
                hoverMonsterKills: snapshot?.combat.hoverMonsterKills ?? 0,
                stompCount: snapshot?.combat.stompCount ?? 0,
                ufoInterruptCount: snapshot?.hazardStats.ufoInterruptCount ?? 0,
                platformLandCount: snapshot?.landingCount ?? 0,
                itemPickupCount: snapshot?.itemStatus.itemPickupCount ?? 0,
                usedHeadStart: snapshot?.itemStatus.usedHeadStart ?? false,
                usedResurrect: this.successfulRevives > 0,
                runDurationMs,
                isNewBestScore,
            }),
        });
        this.context?.requestExit(result);
    }

    private calculateScore(maxAbsoluteWorldY: number, combatScore = 0): number {
        return this.calculateHeightMeters(maxAbsoluteWorldY) * 10 + Math.max(0, combatScore);
    }

    private calculateHeightMeters(maxAbsoluteWorldY: number): number {
        const startWorldY = (this.config?.fixedPlatforms[0].y ?? 42)
            + (this.config?.player.collisionHeight ?? 68) / 2;
        return Math.max(0, Math.floor((maxAbsoluteWorldY - startWorldY) / 100));
    }

    private persistCurrentRunHistory(
        completed: boolean,
        flush: boolean,
        scoreOverride?: number,
        snapshotOverride?: ReturnType<DoodleJumpSimulation['getSnapshot']>,
        preserveActiveRound = !completed,
    ): boolean {
        const context = this.context;
        const baseline = this.runHistoryBaseline ?? this.saveBaseline;
        if (!context || !baseline || !this.runStarted || (!completed && this.settlementCommitted)) {
            if (flush && context) {
                try {
                    context.services.storage.flush();
                } catch (error: unknown) {
                    console.error('[DoodleJumpGame] Storage flush failed.', error);
                }
            }
            return false;
        }
        const snapshot = snapshotOverride ?? this.simulation?.getSnapshot();
        const score = scoreOverride ?? this.calculateScore(
            snapshot?.maxAbsoluteWorldY ?? 0,
            (snapshot?.combat.score ?? 0) + (snapshot?.hazardStats.score ?? 0),
        );
        const canResumeCurrentState = this.stateMachine.state === 'Playing'
            || this.stateMachine.state === 'Paused';
        const activeRound = !completed
            && preserveActiveRound
            && canResumeCurrentState
            && snapshot
            ? this.buildActiveRound(snapshot, baseline)
            : undefined;
        const history = buildDoodleJumpRunSave(baseline, Object.freeze({
            shots: this.runShotCount,
            kills: snapshot?.combat.killCount ?? 0,
            score,
            maxHeightMeters: this.calculateHeightMeters(snapshot?.maxAbsoluteWorldY ?? 0),
            completed,
            playedAt: Date.now(),
            activeRound,
        }));
        try {
            writeDoodleJumpSave(context.services.storage, history.save, flush);
        } catch (error: unknown) {
            console.error('[DoodleJumpGame] Failed to persist run history.', error);
            return false;
        }
        return history.isNewBestScore;
    }

    private buildActiveRound(
        snapshot: ReturnType<DoodleJumpSimulation['getSnapshot']>,
        baseline: DoodleJumpSaveState,
    ): DoodleJumpActiveRound {
        const historyBaseline: DoodleJumpRunHistoryBaseline = Object.freeze({
            playCount: baseline.playCount,
            highScore: baseline.highScore,
            lastPlayedAt: baseline.lastPlayedAt,
            bestHeightMeters: baseline.bestHeightMeters,
            bestKillCount: baseline.bestKillCount,
            totalShots: baseline.totalShots,
            totalKills: baseline.totalKills,
        });
        return Object.freeze({
            version: 1,
            savedAt: Date.now(),
            historyBaseline,
            runShotCount: this.runShotCount,
            successfulRevives: this.successfulRevives,
            snapshot,
        });
    }

    private historyBaselineState(save: DoodleJumpSaveState): DoodleJumpSaveState {
        const baseline = save.activeRound?.historyBaseline;
        if (!baseline) return save;
        return Object.freeze({
            ...save,
            ...baseline,
            activeRound: undefined,
        });
    }

    private trackExitOnce(reason: string): void {
        if (this.runExitTracked || !this.context) return;
        this.runExitTracked = true;
        this.context.services.analytics.track('doodle_jump_exit', {
            sessionId: this.context.sessionId,
            state: this.stateMachine.state,
            reason,
        });
    }

    private enterSensorError(message: string): void {
        if (this.stateMachine.state === 'Playing') this.inputController?.setEnabled(false);
        if (this.stateMachine.canTransition('Error')) this.stateMachine.transition('Error');
        this.sensorCalibrationVisible = false;
        this.missingResourceActive = false;
        this.lastErrorMessage = message;
        this.updatePresentationState(message);
        this.showSensorErrorView(message);
    }

    private showSensorErrorView(message: string): void {
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'SensorErrorOverlay',
            '重力感应不可用',
            `${message}\n请保持手机竖直并允许重力感应`,
            'panelSensorError',
        );
        this.createButton(overlay, '重试', 0, -10, 280, 86, () => this.retrySensor(), 'primary', 'hudRetryButton');
        this.createButton(overlay, '返回大厅', 0, -120, 280, 86, () => {
            this.trackExitOnce('sensor-error-lobby');
            this.context?.requestLobby(Object.freeze({
                score: 0,
                duration: Math.max(0, Date.now() - this.sessionStartedAt),
                completed: false,
                extra: Object.freeze({ reason: 'sensor-error' }),
            }));
        }, 'secondary', 'hudBackButton');
    }

    private retrySensor(): void {
        if (this.stateMachine.state !== 'Error') return;
        this.destroyOverlay();
        this.stateMachine.transition('SensorCalibrating');
        this.updatePresentationState('请保持手机自然竖直');
        this.lastErrorMessage = '';
        this.showSensorCalibrationOverlay();
        const generation = ++this.lifecycleGeneration;
        void this.inputController?.calibrate().then((result) => {
            if (!this.isGenerationCurrent(generation)
                || this.stateMachine.state !== 'SensorCalibrating') return;
            this.handleCalibrationResult(result);
        });
    }

    private showLoadingOverlay(): void {
        this.destroyOverlay();
        this.createOverlay(
            'LoadingOverlay',
            '正在展开纸面世界',
            '正在加载角色、平台和纸片界面…',
            'panelLoading',
        );
    }

    private showSensorCalibrationOverlay(): void {
        if (this.stateMachine.state !== 'SensorCalibrating') return;
        this.sensorCalibrationVisible = true;
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'SensorCalibrationOverlay',
            '校准重力感应',
            '请自然竖直握住手机并暂时保持不动',
            'panelSensorCalibration',
        );
        const frame = this.textureFrames.tutorialSensorTilt;
        if (frame) this.createSpriteNode(overlay, 'CalibrationGuide', frame, 210, 150, 0, -35);
        this.createLabel(overlay, 'CalibrationHint', '校准期间触摸不会发射纸飞机', 0, -155, 18, COLORS.muted, 410, 38);
        this.createButton(overlay, '返回大厅', 0, -225, 220, 64, () => {
            this.trackExitOnce('calibration-lobby');
            this.context?.requestLobby(Object.freeze({
                score: 0,
                duration: Math.max(0, Date.now() - this.sessionStartedAt),
                completed: false,
                extra: Object.freeze({ reason: 'calibration-exit' }),
            }));
        }, 'secondary', 'hudBackButton');
    }

    private showMissingResourceView(): void {
        this.missingResourceActive = true;
        this.sensorCalibrationVisible = false;
        const names = this.missingRequiredVisuals.slice(0, 3).join('、');
        this.lastErrorMessage = names.length > 0 ? `缺少正式界面资源：${names}` : '正式界面资源不可用';
        this.updatePresentationState('资源缺失');
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'MissingResourceOverlay',
            '纸片资源没有找到',
            `${this.lastErrorMessage}\n可重试重新加载，或安全返回大厅`,
            'panelMissingResource',
        );
        this.createButton(overlay, '重新加载', 0, -10, 290, 82, () => {
            this.context?.requestRestart();
        }, 'primary', 'hudRetryButton');
        this.createButton(overlay, '返回大厅', 0, -120, 280, 78, () => {
            this.context?.requestLobby(Object.freeze({
                score: 0,
                duration: Math.max(0, Date.now() - this.sessionStartedAt),
                completed: false,
                extra: Object.freeze({ reason: 'missing-resource' }),
            }));
        }, 'secondary', 'hudBackButton');
    }

    private buildPresentation(): void {
        this.destroyPresentation();
        const visible = view.getVisibleSize();
        const root = new Node('DoodleJumpDynamicRoot');
        root.layer = this.node.layer;
        root.setParent(this.node);
        root.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.dynamicRoot = root;

        const backgroundRoot = new Node('ParallaxBackgroundRoot');
        backgroundRoot.layer = this.node.layer;
        backgroundRoot.setParent(root);
        backgroundRoot.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.backgroundRoot = backgroundRoot;

        const background = this.createGraphicsNode(
            backgroundRoot,
            'DevelopmentBackground',
            visible.width,
            visible.height,
        );
        const backgroundGraphics = background.getComponent(Graphics)!;
        backgroundGraphics.fillColor = COLORS.paper;
        backgroundGraphics.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        backgroundGraphics.fill();

        const world = new Node('WorldRoot');
        world.layer = this.node.layer;
        world.setParent(root);
        world.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.worldRoot = world;

        const ui = new Node('UiRoot');
        ui.layer = this.node.layer;
        ui.setParent(root);
        ui.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.uiRoot = ui;

        const overlay = new Node('OverlayRoot');
        overlay.layer = this.node.layer;
        overlay.setParent(root);
        overlay.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.overlayRoot = overlay;
        const flowOverlay = new Node('FlowOverlayRoot');
        flowOverlay.layer = this.node.layer;
        flowOverlay.setParent(overlay);
        flowOverlay.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.flowOverlayRoot = flowOverlay;
        const pauseOverlay = new Node('PauseOverlayRoot');
        pauseOverlay.layer = this.node.layer;
        pauseOverlay.setParent(overlay);
        pauseOverlay.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.pauseOverlayRoot = pauseOverlay;
        overlay.active = false;
        overlay.on(Node.EventType.TOUCH_START, this.handleOverlayInput, this);
        overlay.on(Node.EventType.TOUCH_MOVE, this.handleOverlayInput, this);
        overlay.on(Node.EventType.TOUCH_END, this.handleOverlayInput, this);
        overlay.on(Node.EventType.TOUCH_CANCEL, this.handleOverlayInput, this);
        overlay.on(Node.EventType.MOUSE_DOWN, this.handleOverlayInput, this);
        overlay.on(Node.EventType.MOUSE_MOVE, this.handleOverlayInput, this);
        overlay.on(Node.EventType.MOUSE_UP, this.handleOverlayInput, this);

        this.createWorldNodes();
        this.createHud();
        this.node.on(Node.EventType.TOUCH_START, this.handleGameplayTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.handleGameplayTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.handleGameplayRelease, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.handleGameplayTouchCancel, this);
        this.node.on(Node.EventType.MOUSE_DOWN, this.handleGameplayMouseDown, this);
        this.node.on(Node.EventType.MOUSE_MOVE, this.handleGameplayMouseMove, this);
        this.node.on(Node.EventType.MOUSE_UP, this.handleGameplayMouseRelease, this);
        this.renderSimulation();
    }

    private createWorldNodes(): void {
        if (!this.worldRoot || !this.config) return;
        this.routeDebugNode = this.createGraphicsNode(
            this.worldRoot,
            'GeneratedRouteDebug',
            this.config.design.width,
            this.config.design.height,
        );
        this.routeDebugNode.active = this.config.generation.showRouteDebug;
        this.platformNodeTypes = [];
        this.platformNodes = this.config.fixedPlatforms.map((platform) => {
            const node = this.createGraphicsNode(
                this.worldRoot!,
                `Platform-${platform.id}`,
                platform.width,
                24,
            );
            const graphics = node.getComponent(Graphics)!;
            graphics.fillColor = platform.type === 'moving' ? COLORS.coral : COLORS.platform;
            graphics.roundRect(-platform.width / 2, -9, platform.width, 18, 9);
            graphics.fill();
            graphics.strokeColor = COLORS.ink;
            graphics.lineWidth = 3;
            graphics.roundRect(-platform.width / 2, -9, platform.width, 18, 9);
            graphics.stroke();
            return node;
        });
        const player = this.createGraphicsNode(this.worldRoot, 'Player', 72, 92);
        const playerGraphics = player.getComponent(Graphics)!;
        playerGraphics.fillColor = COLORS.teal;
        playerGraphics.roundRect(-26, -34, 52, 68, 16);
        playerGraphics.fill();
        playerGraphics.strokeColor = COLORS.ink;
        playerGraphics.lineWidth = 4;
        playerGraphics.roundRect(-26, -34, 52, 68, 16);
        playerGraphics.stroke();
        this.playerNode = player;
        this.createPlayerContactEffect(player);
        this.createHazardFailureEffect(player);
        this.createPlayerItemVisuals(player);
        this.createItemEffect();
        this.createFlightPowerDropVisual();

        this.createLandingDebrisEffect();

        const reticle = this.createGraphicsNode(this.worldRoot, 'AimReticle', 58, 58);
        const reticleGraphics = reticle.getComponent(Graphics)!;
        reticleGraphics.strokeColor = COLORS.teal;
        reticleGraphics.lineWidth = 4;
        reticleGraphics.circle(0, 0, 18);
        reticleGraphics.stroke();
        reticle.active = false;
        this.aimReticleNode = reticle;
    }

    private createHud(): void {
        if (!this.uiRoot || !this.context) return;
        const visible = view.getVisibleSize();
        const layout = this.context.services.platform.getLayoutInfo();
        const safe = calculateVerticalSafeBounds(visible.height, layout, 18);
        const title = this.createLabel(
            this.uiRoot,
            'Title',
            '纸片跳跃',
            0,
            safe.topY - 42,
            34,
            COLORS.ink,
            320,
            58,
        );
        title.horizontalAlign = 1;
        title.node.active = false;
        this.titleLabel = title;
        this.statusLabel = this.createLabel(
            this.uiRoot,
            'Status',
            '资源加载中',
            0,
            safe.topY - 94,
            22,
            COLORS.muted,
            Math.min(540, visible.width - 80),
            44,
        );
        this.statusLabel.node.active = false;
        const createCard = (
            name: string,
            key: TextureKey,
            width: number,
            height: number,
            x: number,
            y: number,
        ): Node => {
            const card = this.createGraphicsNode(this.uiRoot!, name, width, height);
            card.setPosition(x, y, 0);
            const graphics = card.getComponent(Graphics)!;
            graphics.fillColor = COLORS.paperOverlay;
            graphics.roundRect(-width / 2, -height / 2, width, height, 14);
            graphics.fill();
            const frame = this.textureFrames[key];
            if (frame) this.applySpriteVisual(card, frame);
            return card;
        };
        this.scoreCardNode = createCard(
            'ScoreCard',
            'hudScoreCard',
            185,
            122,
            -visible.width / 2 + 103,
            safe.topY - 65,
        );
        const scoreCaption = this.createLabel(
            this.scoreCardNode,
            'ScoreCaption',
            '分数',
            31,
            27,
            18,
            COLORS.ink,
            104,
            30,
        );
        scoreCaption.horizontalAlign = 1;
        this.scoreLabel = this.createLabel(
            this.scoreCardNode,
            'Score',
            '0000',
            31,
            -14,
            24,
            COLORS.paper,
            114,
            38,
        );
        this.heightCardNode = createCard(
            'HeightCard',
            'hudHeightCard',
            205,
            111,
            -visible.width / 2 + 306,
            safe.topY - 65,
        );
        const heightCaption = this.createLabel(
            this.heightCardNode,
            'HeightCaption',
            '高度',
            34,
            24,
            18,
            COLORS.ink,
            112,
            30,
        );
        heightCaption.horizontalAlign = 1;
        this.heightLabel = this.createLabel(
            this.heightCardNode,
            'Height',
            '0000m',
            34,
            -11,
            23,
            COLORS.paper,
            126,
            38,
        );
        this.itemStatusFrameNode = new Node('ItemStatusRow');
        this.itemStatusFrameNode.layer = this.node.layer;
        this.itemStatusFrameNode.setParent(this.uiRoot);
        this.itemStatusFrameNode.setPosition(
            -visible.width / 2 + 24,
            safe.topY - 158,
            0,
        );
        this.itemStatusFrameNode.addComponent(UITransform).setContentSize(
            Math.max(1, visible.width - 48),
            54,
        );
        this.itemStatusSlots = [0, 1, 2].map((index) => (
            this.createItemStatusSlot(this.itemStatusFrameNode!, index)
        ));
        this.itemStatusFrameNode.active = false;
        this.pauseButton = this.createButton(
            this.uiRoot,
            '',
            visible.width / 2 - 54,
            safe.topY - 46,
            72,
            72,
            () => {
                if (this.stateMachine.state === 'Playing') this.context?.requestPause();
            },
            'secondary',
            'hudPauseButton',
        );
        this.pauseButton.name = 'Button-Pause';
        this.rulesButton = this.createButton(
            this.uiRoot,
            '',
            visible.width / 2 - 134,
            safe.topY - 46,
            72,
            72,
            () => this.openRulesFromHud(),
            'secondary',
            'hudRulesButton',
        );
        this.rulesButton.name = 'Button-Rules';
        this.debugLabel = this.createLabel(
            this.uiRoot,
            'Debug',
            'state=Loading',
            0,
            safe.bottomY + 34,
            18,
            COLORS.muted,
            Math.min(650, visible.width - 48),
            82,
        );
        this.debugLabel.lineHeight = 22;
        this.debugLabel.node.active = this.config?.generation.showRouteDebug === true
            || this.config?.generation.singleStep === true;
        if (this.config?.generation.singleStep) {
            this.singleStepButton = this.createButton(
                this.uiRoot,
                '生成下一块',
                0,
                safe.bottomY + 112,
                240,
                64,
                () => {
                    this.simulation?.debugGenerateNext();
                    this.renderSimulation();
                },
            );
        }
    }

    private createItemStatusSlot(parent: Node, index: number): DoodleJumpItemStatusSlot {
        const root = new Node(`ItemStatusSlot-${index}`);
        root.layer = this.node.layer;
        root.setParent(parent);
        root.addComponent(UITransform).setContentSize(170, 50);
        root.active = false;

        const iconNode = new Node('Icon');
        iconNode.layer = this.node.layer;
        iconNode.setParent(root);
        iconNode.setPosition(-61, 0, 0);
        iconNode.addComponent(UITransform).setContentSize(46, 46);
        const icon = iconNode.addComponent(Sprite);
        icon.sizeMode = Sprite.SizeMode.CUSTOM;

        const track = this.createGraphicsNode(root, 'ProgressTrack', 112, 28);
        track.setPosition(27, 0, 0);
        const graphics = track.getComponent(Graphics)!;
        graphics.fillColor = new Color(235, 228, 204, 224);
        graphics.strokeColor = COLORS.tealDark;
        graphics.lineWidth = 2;
        graphics.roundRect(-56, -14, 112, 28, 12);
        graphics.fill();
        graphics.stroke();

        const fill = new Node('ProgressFill');
        fill.layer = this.node.layer;
        fill.setParent(track);
        const fillTransform = fill.addComponent(UITransform);
        fillTransform.setContentSize(104, 22);
        fillTransform.setAnchorPoint(0, 0.5);
        fill.setPosition(-52, 0, 0);
        const fillSprite = fill.addComponent(Sprite);
        fillSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        fillSprite.spriteFrame = this.textureFrames.hudItemProgressFill ?? null;
        return { root, icon, track, fill };
    }

    private renderSimulation(): void {
        const snapshot = this.simulation?.getSnapshot();
        const visible = view.getVisibleSize();
        if (!snapshot || !this.config) return;
        const centerX = this.config.design.width / 2;
        const cameraCenterY = snapshot.cameraBottomY + visible.height / 2;
        this.playerNode?.setPosition(
            snapshot.playerX - centerX,
            snapshot.playerY - cameraCenterY,
            0,
        );
        if (this.previousRenderedPlayerX !== undefined
            && Math.abs(snapshot.playerX - this.previousRenderedPlayerX) > this.config.design.width / 2) {
            this.wrapEffectRemaining = 0.28;
        }
        this.previousRenderedPlayerX = snapshot.playerX;
        this.updatePlayerVisual(snapshot.velocityX, snapshot.itemStatus);
        this.updatePlayerItemVisuals(
            snapshot.itemStatus,
            snapshot.elapsedSeconds,
            snapshot.velocityY,
        );
        this.renderLandingEffect(cameraCenterY, centerX);
        this.renderItemEffect(cameraCenterY, centerX);
        this.renderFlightPowerDrop(cameraCenterY, centerX, snapshot.cameraBottomY);
        this.updateParallaxBackground(snapshot.cameraBottomY, visible);
        this.ensurePlatformNodes(snapshot.platforms.length);
        snapshot.platforms.forEach((platform, index) => {
            const node = this.platformNodes[index];
            if (!node?.isValid) return;
            node.active = !platform.consumed;
            const platformVisualHeight = 42;
            node.setPosition(
                platform.x - centerX,
                platform.y - platformVisualHeight / 2 - cameraCenterY,
                0,
            );
            node.getComponent(UITransform)?.setContentSize(platform.width, platformVisualHeight);
            this.applyPlatformVisual(
                node,
                index,
                platform.type,
                platform.warningProgress,
                platform.id === 'P0',
                snapshot.elapsedSeconds,
            );
        });
        this.renderRouteDebug(snapshot.platforms, centerX, cameraCenterY);
        for (let index = snapshot.platforms.length; index < this.platformNodes.length; index += 1) {
            this.platformNodes[index].active = false;
        }
        this.ensureItemNodes(snapshot.items.length);
        snapshot.items.forEach((item, index) => {
            const node = this.itemNodes[index];
            if (!node?.isValid) return;
            node.active = true;
            node.setPosition(
                item.x - centerX,
                item.y - cameraCenterY,
                0,
            );
            this.applyItemVisual(node, index, item, snapshot.elapsedSeconds);
        });
        for (let index = snapshot.items.length; index < this.itemNodes.length; index += 1) {
            this.itemNodes[index].active = false;
        }
        this.ensureEnemyNodes(snapshot.enemies.length);
        snapshot.enemies.forEach((enemy, index) => {
            const node = this.enemyNodes[index];
            if (!node?.isValid) return;
            node.active = true;
            node.setPosition(enemy.x - centerX, enemy.y - cameraCenterY, 0);
            this.applyEnemyVisual(node, index, enemy, snapshot.elapsedSeconds);
        });
        for (let index = snapshot.enemies.length; index < this.enemyNodes.length; index += 1) {
            this.enemyNodes[index].active = false;
        }
        this.ensureHazardNodes(snapshot.hazards.length);
        snapshot.hazards.forEach((hazard, index) => {
            const node = this.hazardNodes[index];
            if (!node?.isValid) return;
            node.active = true;
            node.setPosition(hazard.x - centerX, hazard.y - cameraCenterY, 0);
            this.applyHazardVisual(node, index, hazard, snapshot.elapsedSeconds);
        });
        for (let index = snapshot.hazards.length; index < this.hazardNodes.length; index += 1) {
            this.hazardNodes[index].active = false;
        }
        this.renderCombatVisuals(centerX, cameraCenterY);
        // Generated platform nodes may be created after item nodes. Reassert
        // the intended gameplay order every frame: platforms < items < player.
        this.itemNodes.forEach((node) => {
            if (node.active && this.worldRoot?.isValid) {
                node.setSiblingIndex(Math.max(0, this.worldRoot.children.length - 1));
            }
        });
        if (this.landingDebrisRoot?.isValid
            && this.landingDebrisRoot.active
            && this.worldRoot?.isValid) {
            this.landingDebrisRoot.setSiblingIndex(Math.max(0, this.worldRoot.children.length - 1));
        }
        if (this.playerNode?.isValid && this.worldRoot?.isValid) {
            this.playerNode.setSiblingIndex(Math.max(0, this.worldRoot.children.length - 1));
        }
        if (this.aimReticleNode?.isValid && this.worldRoot?.isValid) {
            this.aimReticleNode.setSiblingIndex(Math.max(0, this.worldRoot.children.length - 1));
        }
        this.activeProjectiles.forEach((projectile) => {
            projectile.node.setPosition(
                projectile.x - centerX,
                projectile.y - cameraCenterY,
                0,
            );
        });
        const meters = this.calculateHeightMeters(snapshot.maxAbsoluteWorldY);
        const score = meters * 10 + snapshot.combat.score + snapshot.hazardStats.score;
        if (score !== this.lastReportedScore) {
            this.lastReportedScore = score;
            this.context?.reportScore(score);
        }
        const meterText = meters.toString();
        const paddedMeters = meterText.length >= 4
            ? meterText
            : `0000`.slice(meterText.length) + meterText;
        if (this.heightLabel) this.heightLabel.string = `${paddedMeters}m`;
        const scoreText = Math.max(0, Math.floor(score)).toString();
        const paddedScore = scoreText.length >= 4
            ? scoreText
            : `0000`.slice(scoreText.length) + scoreText;
        if (this.scoreLabel) this.scoreLabel.string = paddedScore;
        this.updateItemHud(snapshot.itemStatus, snapshot.velocityY);
        if (this.debugLabel) {
            const inputDebug = this.inputController?.getDebugState();
            this.debugLabel.string = [
                `state=${this.stateMachine.state} seed=${snapshot.seed} cursor=${snapshot.generatorCursor} degraded=${snapshot.degradedGenerationCount}`,
                `platforms=${snapshot.platforms.length}/${this.config.generation.maxActivePlatforms} enemies=${snapshot.enemies.length}/${this.config.enemies.maximumActive} hazards=${snapshot.hazards.length} items=${snapshot.items.length}/${this.config.items.maximumActive} nodes=${this.countDynamicNodes()}`,
                `kills=${snapshot.combat.killCount} stomps=${snapshot.combat.stompCount} hits=${snapshot.combat.hitCount} ufoStops=${snapshot.hazardStats.ufoInterruptCount} itemRng=${snapshot.randomStreams.item.cursor}`,
                `listeners=${this.countOwnedListeners()} timers=${(inputDebug?.timerCount ?? 0) + (this.failureDelayPending ? 1 : 0)} dropped=${snapshot.droppedFrameSeconds.toFixed(3)}s`,
            ].join('\n');
        }
    }

    private renderRouteDebug(
        platforms: ReturnType<DoodleJumpSimulation['getSnapshot']>['platforms'],
        centerX: number,
        cameraCenterY: number,
    ): void {
        const graphics = this.routeDebugNode?.getComponent(Graphics);
        if (!graphics || !this.config?.generation.showRouteDebug) return;
        graphics.clear();
        const draw = (degraded: boolean): void => {
            graphics.strokeColor = degraded ? COLORS.coral : COLORS.tealDark;
            graphics.lineWidth = degraded ? 5 : 3;
            platforms.forEach((platform) => {
                if (!platform.predecessorId || platform.degraded !== degraded) return;
                const predecessor = platforms.find((candidate) => (
                    candidate.id === platform.predecessorId
                ));
                if (!predecessor) return;
                graphics.moveTo(predecessor.x - centerX, predecessor.y - cameraCenterY);
                graphics.lineTo(platform.x - centerX, platform.y - cameraCenterY);
            });
            graphics.stroke();
        };
        draw(false);
        draw(true);
    }

    private ensurePlatformNodes(count: number): void {
        if (!this.worldRoot || !this.config) return;
        while (this.platformNodes.length < count) {
            const index = this.platformNodes.length;
            const platform = this.createGraphicsNode(
                this.worldRoot,
                `Platform-runtime-${index}`,
                190,
                18,
            );
            const graphics = platform.getComponent(Graphics)!;
            graphics.fillColor = COLORS.platform;
            graphics.roundRect(-95, -9, 190, 18, 9);
            graphics.fill();
            const frame = this.textureFrames.normalPlatform;
            if (frame) {
                this.applySpriteVisual(platform, frame);
            }
            this.platformNodes.push(platform);
            this.platformNodeTypes.push('');
        }
    }

    private ensureEnemyNodes(count: number): void {
        if (!this.worldRoot) return;
        while (this.enemyNodes.length < count) {
            const index = this.enemyNodes.length;
            const enemy = this.createGraphicsNode(
                this.worldRoot,
                `Enemy-runtime-${index}`,
                76,
                70,
            );
            const graphics = enemy.getComponent(Graphics)!;
            graphics.fillColor = new Color(217, 109, 120, 255);
            graphics.strokeColor = COLORS.ink;
            graphics.lineWidth = 3;
            graphics.roundRect(-27, -25, 54, 50, 14);
            graphics.fill();
            graphics.stroke();
            this.enemyNodes.push(enemy);
            this.enemyNodeTypes.push('');
        }
    }

    private ensureItemNodes(count: number): void {
        if (!this.worldRoot) return;
        while (this.itemNodes.length < count) {
            const index = this.itemNodes.length;
            const item = new Node(`Item-runtime-${index}`);
            item.layer = this.node.layer;
            item.setParent(this.worldRoot);
            item.addComponent(UITransform).setContentSize(112, 112);

            const sparkle = new Node('PickupSparkle');
            sparkle.layer = this.node.layer;
            sparkle.setParent(item);
            sparkle.addComponent(UITransform).setContentSize(104, 81);
            const sparkleSprite = sparkle.addComponent(Sprite);
            sparkleSprite.spriteFrame = this.textureFrames.itemPickupSparkles ?? null;

            const visual = new Node('ItemVisual');
            visual.layer = this.node.layer;
            visual.setParent(item);
            visual.addComponent(UITransform).setContentSize(68, 68);
            this.itemNodes.push(item);
            this.itemNodeTypes.push('');
        }
    }

    private applyItemVisual(
        node: Node,
        index: number,
        item: DoodleJumpItemSnapshot,
        elapsedSeconds: number,
    ): void {
        const key = item.type === 'spring' ? 'itemSpring'
            : item.type === 'trampoline' ? 'itemTrampoline'
                : item.type === 'jetpack' ? 'itemJetpack'
                    : item.type === 'propeller-hat' ? 'itemPropellerHat'
                        : item.type === 'rocket' ? 'itemRocket'
                            : 'itemShield';
        const frame = this.textureFrames[key as TextureKey];
        if (!frame) return;
        const visual = node.getChildByName('ItemVisual');
        if (!visual?.isValid) return;
        const width = item.type === 'trampoline' ? 80 : 64;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        visual.getComponent(UITransform)?.setContentSize(width, height);
        if (this.itemNodeTypes[index] !== item.type) {
            this.applySpriteVisual(visual, frame);
            this.itemNodeTypes[index] = item.type;
        }
        this.syncSpriteVisualSize(visual);

        const sparkle = node.getChildByName('PickupSparkle');
        const sparkleSprite = sparkle?.getComponent(Sprite);
        if (sparkle?.isValid && sparkleSprite) {
            const phase = elapsedSeconds * 2.15 + item.phase * Math.PI * 2;
            const pulse = (Math.sin(phase) + 1) / 2;
            const sparkleWidth = item.type === 'trampoline' ? 118 : 100;
            const sparkleFrame = sparkleSprite.spriteFrame;
            const sparkleHeight = sparkleWidth
                * Math.max(1, sparkleFrame?.originalSize.height ?? 1)
                / Math.max(1, sparkleFrame?.originalSize.width ?? 1);
            sparkle.getComponent(UITransform)?.setContentSize(sparkleWidth, sparkleHeight);
            const scale = 0.9 + pulse * 0.12;
            sparkle.setScale(scale, scale, 1);
            sparkle.setPosition(0, 3 + pulse * 2, 0);
            sparkle.setRotationFromEuler(0, 0, Math.sin(phase * 0.55) * 5);
            sparkleSprite.color = new Color(255, 255, 255, 145 + Math.round(pulse * 80));
        }
    }

    private applyEnemyVisual(
        node: Node,
        index: number,
        enemy: DoodleJumpEnemySnapshot,
        elapsedSeconds: number,
    ): void {
        const frameIndex = Math.floor((elapsedSeconds + enemy.animationPhase) * 6) % 2;
        const key = enemy.type === 'small'
            ? frameIndex === 0 ? 'enemySmall01' : 'enemySmall02'
            : enemy.type === 'large'
                ? frameIndex === 0 ? 'enemyLarge01' : 'enemyLarge02'
                : frameIndex === 0 ? 'enemyHover01' : 'enemyHover02';
        const visualWidth = enemy.width
            + (enemy.type === 'large' ? 28 : 22) * ENEMY_VISUAL_MARGIN_SCALE;
        const visualHeight = enemy.height
            + (enemy.type === 'large' ? 24 : 20) * ENEMY_VISUAL_MARGIN_SCALE;
        node.getComponent(UITransform)?.setContentSize(visualWidth, visualHeight);
        if (this.enemyNodeTypes[index] !== key) {
            const frame = this.textureFrames[key as TextureKey];
            if (frame) this.applySpriteVisual(node, frame);
            this.enemyNodeTypes[index] = key;
        }
        this.syncSpriteVisualSize(node);
        const sprite = this.getSpriteVisual(node);
        if (sprite) {
            sprite.color = enemy.hurt
                ? new Color(255, 178, 171, 255)
                : new Color(255, 255, 255, 255);
            const groundSurfaceOffset = enemy.type === 'hover'
                ? 0
                : GROUND_ENEMY_VISIBLE_SURFACE_OFFSET;
            sprite.node.setPosition(
                0,
                (visualHeight - enemy.height) / 2 + groundSurfaceOffset,
                0,
            );
        }
        let debug = node.getChildByName('EnemyCollisionDebug');
        if (this.config?.generation.showRouteDebug) {
            if (!debug) {
                debug = this.createGraphicsNode(node, 'EnemyCollisionDebug', enemy.width, enemy.height);
            }
            debug.active = true;
            debug.getComponent(UITransform)?.setContentSize(enemy.width, enemy.height);
            const graphics = debug.getComponent(Graphics)!;
            graphics.clear();
            graphics.strokeColor = COLORS.coral;
            graphics.lineWidth = 2;
            graphics.rect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);
            graphics.stroke();
            graphics.strokeColor = COLORS.tealDark;
            graphics.rect(
                -enemy.width / 2,
                enemy.height / 2 - this.config.enemies[enemy.type].headZoneHeight,
                enemy.width,
                this.config.enemies[enemy.type].headZoneHeight,
            );
            graphics.stroke();
        } else if (debug) {
            debug.active = false;
        }
    }

    private ensureHazardNodes(count: number): void {
        if (!this.worldRoot) return;
        while (this.hazardNodes.length < count) {
            const index = this.hazardNodes.length;
            const hazard = new Node(`Hazard-runtime-${index}`);
            hazard.layer = this.node.layer;
            hazard.setParent(this.worldRoot);
            hazard.addComponent(UITransform).setContentSize(120, 120);
            this.hazardNodes.push(hazard);
            this.hazardNodeTypes.push('');
        }
    }

    private applyHazardVisual(
        node: Node,
        index: number,
        hazard: DoodleJumpHazardSnapshot,
        elapsedSeconds: number,
    ): void {
        if (!this.config) return;
        const setChild = (
            name: string,
            frame: SpriteFrame | undefined,
            width: number,
            height: number,
            x: number,
            y: number,
        ): Node | undefined => {
            if (!frame) return undefined;
            let child = node.getChildByName(name);
            if (!child) {
                child = new Node(name);
                child.layer = node.layer;
                child.setParent(node);
                child.addComponent(UITransform);
                child.addComponent(UIOpacity);
            }
            child.active = true;
            child.getComponent(UITransform)?.setContentSize(width, height);
            child.setPosition(x, y, 0);
            this.applySpriteVisual(child, frame);
            return child;
        };
        const hideChild = (name: string): void => {
            const child = node.getChildByName(name);
            if (child) child.active = false;
        };
        ['UfoBeam', 'UfoLock', 'UfoTether', 'BlackHoleCore', 'TrapFlash'].forEach(hideChild);
        node.setRotationFromEuler(0, 0, 0);
        node.setScale(1, 1, 1);
        const existingBodyOpacity = node.getChildByName('SpriteVisual')?.getComponent(UIOpacity);
        if (existingBodyOpacity) existingBodyOpacity.opacity = 255;

        if (hazard.type === 'ufo') {
            node.getComponent(UITransform)?.setContentSize(156, 104);
            const beamHeight = this.config.hazards.ufo.beamLength;
            const beam = setChild(
                'UfoBeam',
                this.textureFrames.ufoBeam,
                this.config.hazards.ufo.beamWidth + 18,
                beamHeight,
                UFO_BEAM_VISUAL_CENTER_OFFSET_X,
                -beamHeight / 2 - hazard.height / 2 + 12,
            );
            if (beam) {
                beam.setSiblingIndex(0);
                const opacity = beam.getComponent(UIOpacity);
                if (opacity) opacity.opacity = Math.round(
                    48 + hazard.lockProgress * 90 + hazard.abductionProgress * 70,
                );
            }
            const lock = setChild(
                'UfoLock',
                this.textureFrames.ufoLockTarget,
                104,
                104,
                0,
                -Math.min(beamHeight - 62, 236),
            );
            if (lock) {
                lock.active = hazard.lockProgress > 0 && hazard.abductionProgress <= 0;
                lock.setScale(0.82 + hazard.lockProgress * 0.2, 0.82 + hazard.lockProgress * 0.2, 1);
                lock.setRotationFromEuler(0, 0, elapsedSeconds * 54);
            }
            const tether = setChild(
                'UfoTether',
                this.textureFrames.ufoTether,
                36,
                Math.min(280, beamHeight - 70),
                0,
                -Math.min(beamHeight / 2, 154),
            );
            if (tether) {
                tether.active = hazard.abductionProgress > 0;
                const opacity = tether.getComponent(UIOpacity);
                if (opacity) opacity.opacity = Math.round(110 + hazard.abductionProgress * 145);
            }
            if (this.textureFrames.ufo) this.applySpriteVisual(node, this.textureFrames.ufo);
            const body = this.getSpriteVisual(node);
            if (body) {
                body.color = hazard.paused
                    ? new Color(255, 183, 196, 255)
                    : new Color(255, 255, 255, 255);
                body.node.setPosition(0, 0, 0);
                body.node.setRotationFromEuler(0, 0, Math.sin(elapsedSeconds * 3 + hazard.phase * 6) * 2);
            }
        } else if (hazard.type === 'black-hole') {
            const diameter = this.config.hazards.blackHole.outerRadius * 2;
            node.getComponent(UITransform)?.setContentSize(diameter, diameter);
            if (this.textureFrames.blackHoleRing) {
                this.applySpriteVisual(node, this.textureFrames.blackHoleRing);
            }
            const ring = this.getSpriteVisual(node);
            ring?.node.setRotationFromEuler(0, 0, elapsedSeconds * 18 + hazard.phase * 360);
            const ringOpacity = ring?.node.getComponent(UIOpacity)
                ?? ring?.node.addComponent(UIOpacity);
            if (ringOpacity) ringOpacity.opacity = 188;
            const core = setChild(
                'BlackHoleCore',
                this.textureFrames.blackHoleCore,
                this.config.hazards.blackHole.coreRadius * 2.8,
                this.config.hazards.blackHole.coreRadius * 2.8,
                0,
                0,
            );
            core?.setRotationFromEuler(0, 0, -elapsedSeconds * 42);
        } else {
            node.getComponent(UITransform)?.setContentSize(76, 42);
            if (this.textureFrames.bearTrap) {
                this.applySpriteVisual(node, this.textureFrames.bearTrap);
            }
            const body = this.getSpriteVisual(node);
            if (body) {
                // Hazard nodes are pooled. A node that previously rendered a
                // swaying UFO must not carry that child rotation into a trap.
                body.color = new Color(255, 255, 255, 255);
                body.node.setPosition(0, 0, 0);
                body.node.setRotationFromEuler(0, 0, 0);
                body.node.setScale(1, 1, 1);
            }
            const flash = setChild(
                'TrapFlash',
                this.textureFrames.bearTrapFlash,
                110,
                86,
                0,
                8,
            );
            if (flash) {
                flash.active = hazard.triggered;
                flash.setScale(1.12, 1.12, 1);
            }
        }
        this.hazardNodeTypes[index] = hazard.type;
        this.syncSpriteVisualSize(node);
    }

    private applyPlatformVisual(
        node: Node,
        index: number,
        type: string,
        warningProgress: number,
        isStarterFloor = false,
        elapsedSeconds = 0,
    ): void {
        const fullVisual = node.getChildByName('SpriteVisual');
        const breakLeft = node.getChildByName('BreakLeftVisual');
        const breakRight = node.getChildByName('BreakRightVisual');
        const isBreaking = type === 'breakable' && warningProgress > 0;
        if (fullVisual) fullVisual.active = !isBreaking && !isStarterFloor;
        if (breakLeft) breakLeft.active = isBreaking;
        if (breakRight) breakRight.active = isBreaking;
        const textureKey = type === 'moving' ? 'movingPlatform'
            : type === 'vertical-moving' ? 'verticalMovingPlatform'
                : type === 'spiked' ? 'spikedPlatform'
                    : type === 'breakable' ? 'breakablePlatform'
                        : type === 'disappearing' ? 'disappearingPlatform'
                            : type === 'shifting' ? 'shiftingPlatform'
                                : type === 'exploding' ? 'explodingPlatform'
                                    : 'normalPlatform';
        if (this.platformNodeTypes[index] !== type) {
            const frame = this.textureFrames[textureKey as TextureKey];
            if (frame) {
                this.applySpriteVisual(node, frame);
            }
            this.platformNodeTypes[index] = type;
        }
        this.syncSpriteVisualSize(node);
        if (isStarterFloor) {
            const starterFullVisual = node.getChildByName('SpriteVisual');
            if (starterFullVisual) starterFullVisual.active = false;
            this.applyStarterFloorVisual(node);
            this.hidePlatformEffect(node);
            return;
        }
        this.hideStarterFloorVisual(node);
        const regularFullVisual = node.getChildByName('SpriteVisual');
        if (regularFullVisual) regularFullVisual.active = !isBreaking;
        if (isBreaking) {
            this.applyBreakablePieces(node, warningProgress);
            this.applyPlatformEffect(node, type, warningProgress, elapsedSeconds);
            return;
        }
        const sprite = this.getSpriteVisual(node);
        if (sprite) {
            const alpha = type === 'disappearing'
                ? Math.max(0, Math.round(255 * (1 - warningProgress * 0.72)))
                : type === 'exploding' && warningProgress > 1
                    ? Math.max(0, Math.round(255 * (2 - warningProgress)))
                    : warningProgress > 0
                    ? Math.floor(warningProgress * 8) % 2 === 0 ? 255 : 110
                    : 255;
            sprite.color = new Color(255, 255, 255, alpha);
            const visual = sprite.node;
            const disappearScale = type === 'disappearing' ? 1 - warningProgress * 0.08 : 1;
            visual.setScale(disappearScale, disappearScale, 1);
            visual.setPosition(0, type === 'disappearing' ? -warningProgress * 5 : 0, 0);
        }
        this.applyPlatformEffect(node, type, warningProgress, elapsedSeconds);
    }

    private applyStarterFloorVisual(node: Node): void {
        const frame = this.textureFrames.normalPlatform;
        if (!frame) return;
        const widths = [136, 164, 104, 172, 178] as const;
        let left = -375;
        widths.forEach((width, index) => {
            const name = `StarterSegment-${index}`;
            let segment = node.getChildByName(name);
            if (!segment) {
                segment = new Node(name);
                segment.layer = node.layer;
                segment.setParent(node);
                segment.addComponent(UITransform);
                const sprite = segment.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            }
            segment.active = true;
            segment.getComponent(UITransform)?.setContentSize(width + 4, 42);
            segment.getComponent(Sprite)!.spriteFrame = frame;
            segment.setPosition(left + width / 2, 0, 0);
            left += width - 1;
        });
    }

    private hideStarterFloorVisual(node: Node): void {
        for (let index = 0; index < 5; index += 1) {
            const segment = node.getChildByName(`StarterSegment-${index}`);
            if (segment) segment.active = false;
        }
    }

    private applyPlatformEffect(
        node: Node,
        type: string,
        progress: number,
        _elapsedSeconds = 0,
    ): void {
        let frame: SpriteFrame | undefined;
        let size = 96;
        let rotation = 0;
        let scale = 1;
        if (type === 'breakable' && progress > 0 && progress < 0.68) {
            frame = this.textureFrames.breakableCracksEffect;
            size = 92;
            rotation = Math.sin(progress * Math.PI * 4) * 3;
            scale = 0.9 + progress * 0.18;
        } else if (type === 'disappearing' && progress > 0) {
            frame = this.textureFrames.disappearingEffect;
            size = 104;
            rotation = progress * 18;
            scale = 0.82 + progress * 0.32;
        } else if (type === 'exploding' && progress > 0 && progress <= 1) {
            frame = this.textureFrames.explosiveCountdownEffect;
            size = 88;
            rotation = progress * 90;
            scale = 0.86 + Math.sin(progress * Math.PI * 6) * 0.08;
        } else if (type === 'exploding' && progress > 1) {
            frame = this.textureFrames.explosionFragmentsEffect;
            size = 126;
            const fragmentProgress = Math.min(1, progress - 1);
            rotation = fragmentProgress * 28;
            scale = 0.72 + fragmentProgress * 0.72;
        }
        if (!frame) {
            this.hidePlatformEffect(node);
            return;
        }
        let effect = node.getChildByName('PlatformEffectVisual');
        if (!effect) {
            effect = new Node('PlatformEffectVisual');
            effect.layer = node.layer;
            effect.setParent(node);
            effect.addComponent(UITransform);
            const sprite = effect.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            effect.addComponent(UIOpacity);
        }
        effect.active = true;
        effect.getComponent(UITransform)?.setContentSize(size, size);
        effect.getComponent(Sprite)!.spriteFrame = frame;
        effect.setPosition(0, type === 'exploding' && progress > 1 ? 15 : 6, 0);
        effect.setScale(scale, scale, 1);
        effect.setRotationFromEuler(0, 0, rotation);
        const opacity = effect.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
    }

    private hidePlatformEffect(node: Node): void {
        const effect = node.getChildByName('PlatformEffectVisual');
        if (effect) effect.active = false;
    }

    private applyBreakablePieces(node: Node, progress: number): void {
        const leftFrame = this.textureFrames.breakableLeft;
        const rightFrame = this.textureFrames.breakableRight;
        if (!leftFrame || !rightFrame) return;
        const parentSize = node.getComponent(UITransform)?.contentSize;
        if (!parentSize) return;
        const createPiece = (name: string, frame: SpriteFrame): Sprite => {
            let piece = node.getChildByName(name);
            if (!piece) {
                piece = new Node(name);
                piece.layer = node.layer;
                piece.setParent(node);
                piece.addComponent(UITransform);
            }
            piece.active = true;
            piece.getComponent(UITransform)?.setContentSize(parentSize.width, parentSize.height);
            const sprite = piece.getComponent(Sprite) ?? piece.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = frame;
            return sprite;
        };
        const left = createPiece('BreakLeftVisual', leftFrame);
        const right = createPiece('BreakRightVisual', rightFrame);
        const fall = progress * progress * 34;
        left.node.setPosition(-progress * 14, -fall, 0);
        right.node.setPosition(progress * 14, -fall - progress * 5, 0);
        left.node.setRotationFromEuler(0, 0, progress * 16);
        right.node.setRotationFromEuler(0, 0, -progress * 16);
        const alpha = Math.max(0, Math.round(255 * (1 - Math.max(0, progress - 0.62) / 0.38)));
        left.color = new Color(255, 255, 255, alpha);
        right.color = new Color(255, 255, 255, alpha);
    }

    private updateShooting(deltaTime: number, visibleHeight: number): void {
        const safeDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
        const cameraBottom = this.simulation?.getCameraBottomY() ?? 0;
        for (let index = this.activeProjectiles.length - 1; index >= 0; index -= 1) {
            const projectile = this.activeProjectiles[index];
            const previousX = projectile.x;
            const previousY = projectile.y;
            projectile.x += projectile.velocityX * safeDelta;
            projectile.y += projectile.velocityY * safeDelta;
            projectile.remainingSeconds -= safeDelta;
            const hit = this.simulation?.hitEnemyByProjectileSweep(
                previousX,
                previousY,
                projectile.x,
                projectile.y,
            );
            if (hit) {
                this.recycleProjectile(index);
                continue;
            }
            if (projectile.remainingSeconds > 0
                && projectile.y > cameraBottom - 160
                && projectile.y < cameraBottom + visibleHeight + 160) continue;
            this.recycleProjectile(index);
        }
        const held = this.attackPointerId !== undefined
            || this.mouseAttackHeld
            || this.inputController?.isKeyboardFireHeld() === true;
        if (held) this.tryFirePaperPlane();
        this.flushShotBatchIfDue(false);
    }

    private consumeCombatEvents(events: readonly DoodleJumpCombatEvent[]): void {
        const context = this.context;
        events.forEach((event) => {
            this.spawnCombatVisual(event);
            context?.services.feedback.play(
                event.type === 'kill' || event.type === 'stomp' ? 'chain' : 'collision',
                { vibrate: event.type !== 'hit' },
            );
            if (event.type === 'hit' || event.type === 'kill') {
                context?.services.analytics.track('doodle_jump_monster_hit', {
                    sessionId: context.sessionId,
                    monsterType: event.enemyType,
                    hitCount: this.simulation?.getSnapshot().combat.hitCount ?? 0,
                });
            }
            if (event.type === 'kill' || event.type === 'stomp') {
                context?.services.analytics.track('doodle_jump_monster_kill', {
                    sessionId: context.sessionId,
                    monsterType: event.enemyType,
                    stomped: event.type === 'stomp',
                });
            }
        });
    }

    private consumeHazardEvents(events: readonly DoodleJumpHazardEvent[]): void {
        const context = this.context;
        events.forEach((event) => {
            if (event.type === 'ufo-interrupt') {
                context?.services.feedback.play('danger');
                this.spawnCombatVisual(Object.freeze({
                    type: 'hit',
                    enemyId: event.hazardId,
                    enemyType: 'hover',
                    x: event.x,
                    y: event.y,
                }));
                context?.services.analytics.track('doodle_jump_ufo_interrupt', {
                    sessionId: context.sessionId,
                    hazardId: event.hazardId,
                    heightMeters: this.calculateHeightMeters(event.y),
                });
            }
        });
    }

    private consumeItemEvents(events: readonly DoodleJumpItemEvent[]): void {
        const context = this.context;
        events.forEach((event) => {
            if (event.type === 'pickup' && event.itemType) {
                context?.services.feedback.play('milestone');
                this.startItemEffect('itemPickupSparkles', event.x, event.y, 0.44);
                context?.services.analytics.track('doodle_jump_item_pickup', {
                    sessionId: context.sessionId,
                    itemType: event.itemType,
                    heightMeters: this.calculateHeightMeters(event.y),
                });
            } else if (event.type === 'landing-boost') {
                this.startItemEffect(
                    event.itemType === 'trampoline' ? 'trampolineRebound' : 'springRebound',
                    event.x,
                    event.y,
                    0.72,
                );
            } else if (event.type === 'power-end'
                && (event.itemType === 'jetpack'
                    || event.itemType === 'propeller-hat'
                    || event.itemType === 'rocket')) {
                this.startFlightPowerDrop(event.itemType, event.x, event.y);
            }
        });
    }

    private createFlightPowerDropVisual(): void {
        if (!this.worldRoot) return;
        const root = new Node('FlightPowerDrop');
        root.layer = this.node.layer;
        root.setParent(this.worldRoot);
        root.addComponent(UITransform).setContentSize(180, 210);
        root.active = false;
        const createSpriteNode = (name: string, width: number, height: number): Node => {
            const node = new Node(name);
            node.layer = root.layer;
            node.setParent(root);
            node.addComponent(UITransform).setContentSize(width, height);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            node.active = false;
            return node;
        };
        this.flightPowerDropRoot = root;
        this.flightPowerDropBodyNode = createSpriteNode('DropBody', 123, 180);
        this.flightPowerDropCapNode = createSpriteNode('DropPropellerCap', 41, 36);
        this.flightPowerDropBladesNode = createSpriteNode('DropPropellerBlades', 55, 14);
    }

    private startFlightPowerDrop(
        type: DoodleJumpFlightPower,
        worldX: number,
        worldY: number,
    ): void {
        const root = this.flightPowerDropRoot;
        const body = this.flightPowerDropBodyNode;
        const cap = this.flightPowerDropCapNode;
        const blades = this.flightPowerDropBladesNode;
        if (!root?.isValid || !body?.isValid || !cap?.isValid || !blades?.isValid) return;
        const direction = this.playerFacing >= 0 ? -1 : 1;
        this.flightPowerDropType = type;
        this.flightPowerDropElapsed = 0;
        this.flightPowerDropWorldX = worldX;
        this.flightPowerDropWorldY = worldY;
        this.flightPowerDropVelocityX = direction * (type === 'rocket' ? 185 : 150);
        this.flightPowerDropVelocityY = type === 'rocket' ? 600 : 520;
        this.flightPowerDropRotation = 0;
        this.flightPowerDropAngularVelocity = direction * (type === 'rocket' ? 250 : 390);
        root.active = true;
        root.setRotationFromEuler(0, 0, 0);
        root.setScale(1, 1, 1);
        root.setSiblingIndex(Math.max(0, root.parent!.children.length - 1));
        body.active = type !== 'propeller-hat';
        cap.active = type === 'propeller-hat';
        blades.active = type === 'propeller-hat';
        if (type === 'jetpack') {
            const frame = this.textureFrames.playerJetpack;
            if (!frame) {
                root.active = false;
                return;
            }
            body.getComponent(Sprite)!.spriteFrame = frame;
            body.getComponent(UITransform)?.setContentSize(76, 72);
            body.setPosition(-25 * this.playerFacing, 11, 0);
            body.setScale(this.playerFacing, 1, 1);
        } else if (type === 'rocket') {
            const frame = this.textureFrames.playerRocket;
            if (!frame) {
                root.active = false;
                return;
            }
            body.getComponent(Sprite)!.spriteFrame = frame;
            body.getComponent(UITransform)?.setContentSize(123, 180);
            body.setPosition(0, 21, 0);
            body.setScale(this.playerFacing, 1, 1);
        } else {
            const capFrame = this.textureFrames.playerPropellerHatCap;
            const bladesFrame = this.textureFrames.playerPropellerHatBlades;
            if (!capFrame || !bladesFrame) {
                root.active = false;
                return;
            }
            cap.getComponent(Sprite)!.spriteFrame = capFrame;
            blades.getComponent(Sprite)!.spriteFrame = bladesFrame;
            cap.setPosition(-3 * this.playerFacing, 79, 0);
            cap.setScale(1, 1, 1);
            blades.setPosition(-3 * this.playerFacing, 98, 0);
            blades.setScale(1, 1, 1);
        }
    }

    private updateFlightPowerDrop(deltaSeconds: number): void {
        const root = this.flightPowerDropRoot;
        if (!root?.isValid || !root.active || !this.flightPowerDropType) return;
        const delta = Math.min(0.05, Math.max(0, deltaSeconds));
        this.flightPowerDropElapsed += delta;
        this.flightPowerDropWorldX += this.flightPowerDropVelocityX * delta;
        this.flightPowerDropVelocityY -= 920 * delta;
        this.flightPowerDropWorldY += this.flightPowerDropVelocityY * delta;
        this.flightPowerDropRotation += this.flightPowerDropAngularVelocity * delta;
        root.setRotationFromEuler(0, 0, this.flightPowerDropRotation);
        if (this.flightPowerDropType === 'propeller-hat') {
            const blades = this.flightPowerDropBladesNode;
            const sprite = blades?.getComponent(Sprite);
            if (blades?.isValid && sprite) {
                const projectedWidth = Math.cos(this.flightPowerDropElapsed * Math.PI * 2 * 5);
                blades.setScale(
                    (projectedWidth < 0 ? -1 : 1) * Math.max(0.08, Math.abs(projectedWidth)),
                    0.94 + Math.abs(projectedWidth) * 0.06,
                    1,
                );
                sprite.color = projectedWidth < 0
                    ? new Color(220, 226, 230, 255)
                    : new Color(255, 255, 255, 255);
            }
        }
        if (this.flightPowerDropElapsed >= 2.4) {
            root.active = false;
            this.flightPowerDropType = undefined;
        }
    }

    private renderFlightPowerDrop(
        cameraCenterY: number,
        centerX: number,
        cameraBottomY: number,
    ): void {
        const root = this.flightPowerDropRoot;
        if (!root?.isValid || !root.active) return;
        root.setPosition(
            this.flightPowerDropWorldX - centerX,
            this.flightPowerDropWorldY - cameraCenterY,
            0,
        );
        if (this.flightPowerDropWorldY < cameraBottomY - 200) {
            root.active = false;
            this.flightPowerDropType = undefined;
        }
    }

    private createItemEffect(): void {
        if (!this.worldRoot) return;
        const effect = new Node('ItemEffect');
        effect.layer = this.node.layer;
        effect.setParent(this.worldRoot);
        effect.addComponent(UITransform).setContentSize(150, 150);
        effect.addComponent(UIOpacity).opacity = 0;
        const sprite = effect.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        effect.active = false;
        this.itemEffectNode = effect;
    }

    private startItemEffect(
        key: TextureKey,
        worldX: number,
        worldY: number,
        duration: number,
    ): void {
        const effect = this.itemEffectNode;
        const frame = this.textureFrames[key];
        if (!effect?.isValid || !frame) return;
        this.itemEffectWorldX = worldX;
        this.itemEffectWorldY = worldY;
        this.itemEffectKey = key;
        this.itemEffectDuration = duration;
        this.itemEffectRemaining = duration;
        effect.active = true;
        effect.getComponent(Sprite)!.spriteFrame = frame;
        const width = (key === 'trampolineRebound' ? 216
                : key === 'springRebound' ? 196
                    : 144)
            * this.visualQualityProfile().effectScale;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        effect.getComponent(UITransform)?.setContentSize(width, height);
    }

    private renderItemEffect(cameraCenterY: number, centerX: number): void {
        const effect = this.itemEffectNode;
        if (!effect?.isValid || this.itemEffectRemaining <= 0) {
            if (effect?.isValid) effect.active = false;
            return;
        }
        const progress = 1 - this.itemEffectRemaining / Math.max(0.001, this.itemEffectDuration);
        effect.active = true;
        effect.setPosition(
            this.itemEffectWorldX - centerX,
            this.itemEffectWorldY - cameraCenterY + progress * 12,
            0,
        );
        const isLandingBoost = this.itemEffectKey === 'springRebound'
            || this.itemEffectKey === 'trampolineRebound';
        const scale = isLandingBoost
            ? 0.9 + progress * 0.48
            : 0.76 + progress * 0.42;
        effect.setScale(scale, scale, 1);
        const opacity = effect.getComponent(UIOpacity);
        if (opacity) {
            const fadeProgress = isLandingBoost
                ? Math.max(0, (progress - 0.38) / 0.62)
                : progress;
            opacity.opacity = Math.max(0, Math.round(255 * (1 - fadeProgress)));
        }
        effect.setSiblingIndex(Math.max(0, effect.parent!.children.length - 1));
    }

    private spawnCombatVisual(event: DoodleJumpCombatEvent): void {
        if (!this.worldRoot) return;
        const kind = event.type === 'hit' ? 'hit' : 'defeat';
        const frame = kind === 'hit'
            ? this.textureFrames.enemyHitScratch
            : this.textureFrames.enemyDefeatFragments;
        if (!frame) return;
        const pooled = this.combatVisualPool.pop();
        const node = pooled?.isValid ? pooled : new Node('EnemyCombatEffect');
        node.layer = this.node.layer;
        if (!node.parent) node.setParent(this.worldRoot);
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        const width = (kind === 'hit' ? 66 : 132)
            * this.visualQualityProfile().effectScale;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        transform.setContentSize(width, height);
        const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
        opacity.opacity = 255;
        this.applySpriteVisual(node, frame);
        node.active = true;
        const durationSeconds = kind === 'hit' ? 0.18 : 0.46;
        this.combatVisuals.push({
            node,
            kind,
            x: event.x,
            y: event.y,
            remainingSeconds: durationSeconds,
            durationSeconds,
        });
    }

    private updateCombatVisuals(deltaTime: number): void {
        const safeDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
        for (let index = this.combatVisuals.length - 1; index >= 0; index -= 1) {
            const visual = this.combatVisuals[index];
            visual.remainingSeconds -= safeDelta;
            if (visual.remainingSeconds > 0) continue;
            visual.node.active = false;
            this.combatVisuals.splice(index, 1);
            this.combatVisualPool.push(visual.node);
        }
    }

    private renderCombatVisuals(centerX: number, cameraCenterY: number): void {
        this.combatVisuals.forEach((visual) => {
            const progress = 1 - visual.remainingSeconds / visual.durationSeconds;
            visual.node.setPosition(
                visual.x - centerX,
                visual.y - cameraCenterY + progress * (visual.kind === 'defeat' ? 20 : 7),
                0,
            );
            const scale = visual.kind === 'defeat'
                ? 0.72 + progress * 0.5
                : 0.82 + progress * 0.18;
            visual.node.setScale(scale, scale, 1);
            const opacity = visual.node.getComponent(UIOpacity);
            if (opacity) opacity.opacity = Math.max(0, Math.round(255 * (1 - progress)));
        });
    }

    private clearCombatVisuals(): void {
        this.combatVisuals.forEach((visual) => {
            if (visual.node.isValid) visual.node.destroy();
        });
        this.combatVisualPool.forEach((node) => {
            if (node.isValid) node.destroy();
        });
        this.combatVisuals = [];
        this.combatVisualPool = [];
    }

    private tryFirePaperPlane(): void {
        if (this.stateMachine.state !== 'Playing' || !this.config || !this.simulation) return;
        const now = Date.now();
        if (now < this.nextFireAt) return;
        const snapshot = this.simulation.getSnapshot();
        const length = Math.sqrt(this.aimX * this.aimX + this.aimY * this.aimY);
        const directionX = length >= 0.0001 ? this.aimX / length : 0;
        const directionY = length >= 0.0001 ? this.aimY / length : 1;
        const node = this.obtainProjectileNode();
        const spawnOffset = 34;
        const projectile: DoodleJumpProjectile = {
            node,
            x: snapshot.playerX + directionX * spawnOffset,
            y: snapshot.playerY + directionY * spawnOffset,
            velocityX: directionX * this.config.shooting.speed,
            velocityY: directionY * this.config.shooting.speed,
            remainingSeconds: this.config.shooting.lifetimeSeconds,
        };
        node.active = true;
        node.setRotationFromEuler(0, 0, Math.atan2(directionY, directionX) * 180 / Math.PI);
        const visible = view.getVisibleSize();
        node.setPosition(
            projectile.x - this.config.design.width / 2,
            projectile.y - (snapshot.cameraBottomY + visible.height / 2),
            0,
        );
        this.activeProjectiles.push(projectile);
        this.nextFireAt = now + this.config.shooting.cooldownMs;
        if (this.shotBatchCount === 0) this.shotBatchStartedAt = now;
        this.shotBatchCount += 1;
        this.runShotCount += 1;
        this.context?.services.feedback.play('fold', { vibrate: false });
    }

    private obtainProjectileNode(): Node {
        const pooled = this.projectilePool.pop();
        if (pooled?.isValid) return pooled;
        const node = this.createGraphicsNode(this.worldRoot!, 'PaperPlaneProjectile', 54, 34);
        const graphics = node.getComponent(Graphics)!;
        graphics.fillColor = COLORS.paper;
        graphics.strokeColor = COLORS.ink;
        graphics.lineWidth = 3;
        graphics.moveTo(-24, -13);
        graphics.lineTo(25, 0);
        graphics.lineTo(-24, 13);
        graphics.lineTo(-12, 0);
        graphics.close();
        graphics.fill();
        graphics.stroke();
        const frame = this.textureFrames.paperPlane;
        if (frame) {
            this.applySpriteVisual(node, frame);
        }
        const trailFrame = this.textureFrames.paperPlaneTrail;
        if (trailFrame && this.visualQualityProfile().secondaryEffects) {
            const trail = this.createSpriteNode(
                node,
                'ProjectileTrail',
                trailFrame,
                62,
                28,
                -34,
                0,
            );
            trail.setSiblingIndex(0);
            const opacity = trail.addComponent(UIOpacity);
            opacity.opacity = 176;
        }
        return node;
    }

    private recycleProjectile(index: number): void {
        const projectile = this.activeProjectiles[index];
        projectile.node.active = false;
        this.activeProjectiles.splice(index, 1);
        this.projectilePool.push(projectile.node);
    }

    private updateAimFromScreenLocation(x: number, y: number): void {
        if (!this.dynamicRoot?.isValid || !this.playerNode?.isValid || !this.config) return;
        // getLocation() is expressed in screen units, not a scene-world
        // position. When the WeChat Canvas is scaled by Fit Width, converting
        // the raw screen point through the bound UI camera first keeps
        // the reticle/player and the touch share the exact same coordinate
        // space on every device.
        const world = this.uiCamera?.screenToWorld(new Vec3(x, y, 0));
        if (!world) return;
        const local = this.worldRoot?.getComponent(UITransform)?.convertToNodeSpaceAR(
            world,
        );
        if (!local) return;
        const deltaX = local.x - this.playerNode.position.x;
        const deltaY = local.y - this.playerNode.position.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < this.config.shooting.nearAimFallbackDistance) {
            this.aimX = 0;
            // A near tap still preserves whether it was above or below the
            // player, so directly-down input cannot silently become an up shot.
            this.aimY = deltaY < 0 ? -1 : 1;
        } else {
            this.aimX = deltaX / distance;
            this.aimY = deltaY / distance;
        }
        if (this.aimReticleNode?.isValid) {
            this.aimReticleNode.active = true;
            this.aimReticleNode.setPosition(local.x, local.y, 0);
        }
    }

    private cancelAttack(flushBatch: boolean): void {
        this.attackPointerId = undefined;
        this.mouseAttackHeld = false;
        if (this.aimReticleNode?.isValid) this.aimReticleNode.active = false;
        if (flushBatch) this.flushShotBatchIfDue(true);
    }

    private flushShotBatchIfDue(force: boolean): void {
        if (this.shotBatchCount <= 0 || !this.context) return;
        const now = Date.now();
        if (!force && now - this.shotBatchStartedAt < 1000) return;
        const rawAngle = Math.atan2(this.aimY, this.aimX) * 180 / Math.PI;
        const aimAngleBucket = ((Math.round(rawAngle / 45) * 45) % 360 + 360) % 360;
        this.context.services.analytics.track('doodle_jump_shot_batch', {
            sessionId: this.context.sessionId,
            batchCount: this.shotBatchCount,
            durationMs: Math.max(0, now - this.shotBatchStartedAt),
            aimAngleBucket,
            shotsInRun: this.runShotCount,
        });
        this.shotBatchCount = 0;
        this.shotBatchStartedAt = 0;
    }

    private resetShootingRuntime(): void {
        this.cancelAttack(true);
        this.activeProjectiles.forEach((projectile) => {
            if (projectile.node.isValid) projectile.node.destroy();
        });
        this.projectilePool.forEach((node) => {
            if (node.isValid) node.destroy();
        });
        this.activeProjectiles = [];
        this.projectilePool = [];
        this.nextFireAt = 0;
        this.aimX = 0;
        this.aimY = 1;
    }

    private updatePresentationState(message: string): void {
        if (this.statusLabel) this.statusLabel.string = message;
        const isPlaying = this.stateMachine.state === 'Playing';
        const showStatus = !isPlaying
            && this.stateMachine.state !== 'Failing'
            && !this.hasVisibleOverlay();
        if (this.titleLabel) this.titleLabel.node.active = showStatus;
        if (this.statusLabel) this.statusLabel.node.active = showStatus;
        if (this.pauseButton) this.pauseButton.active = this.stateMachine.state === 'Playing';
        if (this.rulesButton) this.rulesButton.active = this.stateMachine.state === 'Playing';
        if (this.scoreCardNode) this.scoreCardNode.active = isPlaying;
        if (this.heightCardNode) this.heightCardNode.active = isPlaying;
        if (!isPlaying && this.itemStatusFrameNode) this.itemStatusFrameNode.active = false;
        this.renderSimulation();
    }

    private async loadVisualAssets(): Promise<void> {
        const keys = Object.keys(TEXTURE_PATHS) as TextureKey[];
        const hudKeys = keys.filter((key) => key.indexOf('hud') === 0);
        const itemIconKeys = keys.filter((key) => key.indexOf('itemIcon') === 0);
        const resourceBundle = assetManager.getBundle(DOODLE_JUMP_RESOURCE_BUNDLE);
        if (!resourceBundle) {
            throw new Error(`Bundle ${DOODLE_JUMP_RESOURCE_BUNDLE} is unavailable.`);
        }
        const [hudFrames, itemIconFrames] = await Promise.all([
            loadAutoAtlasFrames(
                resourceBundle,
                DOODLE_JUMP_HUD_ATLAS_PATH,
                hudKeys.map((key) => ({
                    key,
                    frameName: autoAtlasFrameName(TEXTURE_PATHS[key]),
                    fallbackTexturePath: TEXTURE_PATHS[key],
                })),
            ),
            loadAutoAtlasFrames(
                resourceBundle,
                DOODLE_JUMP_ITEM_ICON_ATLAS_PATH,
                itemIconKeys.map((key) => ({
                    key,
                    frameName: autoAtlasFrameName(TEXTURE_PATHS[key]),
                    fallbackTexturePath: TEXTURE_PATHS[key],
                })),
            ),
        ]);
        Object.keys({ ...hudFrames, ...itemIconFrames }).forEach((key) => {
            const frame = hudFrames[key] ?? itemIconFrames[key];
            if (frame) {
                this.textureFrames[key as TextureKey] = frame;
                this.ownedFrames.push(frame);
            }
        });

        const atlasKeys = new Set([...hudKeys, ...itemIconKeys]);
        const frames = await Promise.all(keys.filter((key) => !atlasKeys.has(key)).map(async (key) => {
            const existing = this.textureFrames[key];
            if (existing) return [key, existing] as const;
            try {
                const texture = await this.loadTexture(TEXTURE_PATHS[key]);
                const frame = this.createRuntimeSpriteFrame(key, texture);
                return [key, frame] as const;
            } catch (error: unknown) {
                console.warn(`[DoodleJumpGame] Optional visual unavailable: ${TEXTURE_PATHS[key]}`, error);
                return [key, undefined] as const;
            }
        }));
        frames.forEach(([key, frame]) => {
            if (frame) this.textureFrames[key] = frame;
        });
        this.missingRequiredVisuals = REQUIRED_FORMAL_TEXTURES.filter((key) => (
            this.textureFrames[key] === undefined
        ));
    }

    private async preloadLoadingVisual(): Promise<void> {
        try {
            const texture = await this.loadTexture(TEXTURE_PATHS.panelLoading);
            this.textureFrames.panelLoading = this.createRuntimeSpriteFrame(
                'panelLoading',
                texture,
            );
        } catch (error: unknown) {
            console.warn('[DoodleJumpGame] Formal loading panel unavailable.', error);
        }
    }

    private createRuntimeSpriteFrame(key: TextureKey, texture: Texture2D): SpriteFrame {
        const frame = new SpriteFrame();
        frame.texture = texture;
        // These frames wrap bundle Texture2D assets at runtime. On WeChat,
        // the image native data may be reclaimed after upload while the GPU
        // texture remains valid. Dynamic-atlas packing reads texture.width
        // again and crashes on the reclaimed native data, especially when
        // switching to the landing frame. Keep runtime frames out of the
        // dynamic atlas so rendering uses the already-uploaded texture.
        frame.packable = false;
        // Runtime-created frames do not infer the source dimensions in Cocos
        // Creator 3.8. CUSTOM sprites need both values or they render at zero area.
        frame.rect = new Rect(0, 0, texture.width, texture.height);
        frame.originalSize = new Size(texture.width, texture.height);
        if (SLICED_TEXTURE_KEYS.indexOf(key) >= 0) {
            if (key === 'panelRules') {
                frame.insetLeft = Math.min(104, texture.width - 1);
                frame.insetRight = Math.min(64, texture.width - frame.insetLeft - 1);
                frame.insetTop = Math.min(160, texture.height - 1);
                frame.insetBottom = Math.min(96, texture.height - frame.insetTop - 1);
            } else {
                const inset = Math.max(8, Math.min(42, Math.floor(
                    Math.min(texture.width, texture.height) * 0.18,
                )));
                frame.insetLeft = inset;
                frame.insetRight = inset;
                frame.insetTop = inset;
                frame.insetBottom = inset;
            }
            this.slicedFrames.add(frame);
        }
        this.ownedFrames.push(frame);
        return frame;
    }

    private setGameplayPresentationVisible(visible: boolean): void {
        if (this.backgroundRoot?.isValid) this.backgroundRoot.active = visible;
        if (this.worldRoot?.isValid) this.worldRoot.active = visible;
        if (this.uiRoot?.isValid) this.uiRoot.active = visible;
    }

    private applyVisualAssets(): void {
        const root = this.dynamicRoot;
        if (!root) return;
        const applyHudFrame = (node: Node | undefined, key: TextureKey): void => {
            const frame = this.textureFrames[key];
            if (!node?.isValid || !frame) return;
            const sprite = this.applySpriteVisual(node, frame);
            sprite.node.setSiblingIndex(0);
        };
        applyHudFrame(this.scoreCardNode, 'hudScoreCard');
        applyHudFrame(this.heightCardNode, 'hudHeightCard');
        this.itemStatusSlots.forEach((slot) => {
            slot.fill.getComponent(Sprite)!.spriteFrame = this.textureFrames.hudItemProgressFill ?? null;
        });
        const applyHudIconButton = (button: Node | undefined, key: TextureKey): void => {
            const frame = this.textureFrames[key];
            if (!button?.isValid || !frame) return;
            button.getComponent(Graphics)?.clear();
            let icon = button.getChildByName('ButtonIcon');
            if (!icon) {
                icon = this.createSpriteNode(
                    button,
                    'ButtonIcon',
                    frame,
                    64,
                    64,
                    0,
                    0,
                );
            } else {
                icon.getComponent(Sprite)!.spriteFrame = frame;
                icon.getComponent(UITransform)?.setContentSize(64, 64);
            }
            const iconSprite = icon.getComponent(Sprite);
            if (iconSprite) {
                iconSprite.color = key === 'hudRulesButton'
                    ? new Color(255, 210, 168, 255)
                    : Color.WHITE;
            }
        };
        applyHudIconButton(this.pauseButton, 'hudPauseButton');
        applyHudIconButton(this.rulesButton, 'hudRulesButton');
        const loadingPanel = this.flowOverlayRoot?.getChildByName('LoadingOverlay');
        if (loadingPanel && this.textureFrames.panelLoading) {
            const sprite = this.applySpriteVisual(loadingPanel, this.textureFrames.panelLoading);
            sprite.node.setSiblingIndex(0);
        }
        this.ensureParallaxNodes();
        this.updatePlayerVisual();
        const platformFrame = this.textureFrames.normalPlatform;
        if (platformFrame) {
            this.platformNodes.forEach((node, index) => {
                const width = this.config?.fixedPlatforms[index]?.width
                    ?? node.getComponent(UITransform)?.contentSize.width
                    ?? 150;
                node.getComponent(UITransform)?.setContentSize(width, 42);
                this.applySpriteVisual(node, platformFrame);
                this.platformNodeTypes[index] = '';
            });
        }
        const reticleFrame = this.textureFrames.aimReticle;
        if (reticleFrame && this.aimReticleNode) {
            this.aimReticleNode.getComponent(UITransform)?.setContentSize(58, 58);
            this.applySpriteVisual(this.aimReticleNode, reticleFrame);
        }
        const landingDebrisFrame = this.textureFrames.landingPaperDebris;
        if (landingDebrisFrame) {
            this.landingDebrisVisuals.forEach((node) => {
                const width = 172;
                const height = width
                    * Math.max(1, landingDebrisFrame.originalSize.height)
                    / Math.max(1, landingDebrisFrame.originalSize.width);
                node.getComponent(UITransform)?.setContentSize(width, height);
                this.applySpriteVisual(node, landingDebrisFrame);
            });
        }
        const contactFrame = this.textureFrames.playerContactImpact;
        if (contactFrame && this.playerContactEffectNode) {
            const width = 220;
            const height = width
                * Math.max(1, contactFrame.originalSize.height)
                / Math.max(1, contactFrame.originalSize.width);
            this.playerContactEffectNode.getComponent(UITransform)?.setContentSize(width, height);
            this.applySpriteVisual(this.playerContactEffectNode, contactFrame);
            this.playerContactEffectNode.active = false;
        }
        const snapshot = this.simulation?.getSnapshot();
        if (snapshot) this.updateParallaxBackground(snapshot.cameraBottomY, view.getVisibleSize());
    }

    private ensureParallaxNodes(): void {
        if (!this.backgroundRoot) return;
        const createTile = (name: string): Node => {
            const tile = new Node(name);
            tile.layer = this.node.layer;
            tile.setParent(this.backgroundRoot!);
            tile.addComponent(UITransform);
            return tile;
        };
        while (this.backgroundBaseNodes.length < 4) {
            this.backgroundBaseNodes.push(createTile(
                `ParallaxBase-${this.backgroundBaseNodes.length}`,
            ));
        }
        const decorNodeCount = this.visualQualityProfile().decorNodeCount;
        while (this.backgroundDecorNodes.length < decorNodeCount) {
            this.backgroundDecorNodes.push(createTile(
                `ParallaxDecor-${this.backgroundDecorNodes.length}`,
            ));
        }
    }

    private updateParallaxBackground(cameraBottomY: number, visible: Readonly<Size>): void {
        if (!this.backgroundRoot || this.backgroundBaseNodes.length === 0) return;
        this.positionParallaxTiles(
            this.backgroundBaseNodes,
            0.12,
            cameraBottomY,
            visible,
            (bottom, top) => this.selectBaseBackgroundFrame(bottom, top),
        );
        this.positionRandomDecor(cameraBottomY, visible);
    }

    private positionParallaxTiles(
        nodes: readonly Node[],
        factor: number,
        cameraBottomY: number,
        visible: Readonly<Size>,
        selectFrame: (worldBottom: number, worldTop: number) => SpriteFrame | undefined,
    ): void {
        const tileWidth = visible.width;
        const tileHeight = tileWidth * 1334 / 750;
        const scroll = Math.max(0, cameraBottomY) * factor;
        const firstIndex = Math.floor(scroll / tileHeight) - 1;
        nodes.forEach((node, slot) => {
            const tileIndex = firstIndex + slot;
            const parallaxBottom = tileIndex * tileHeight;
            const worldBottom = parallaxBottom / factor;
            const worldTop = (parallaxBottom + tileHeight) / factor;
            const frame = selectFrame(worldBottom, worldTop);
            node.active = frame !== undefined;
            if (!frame) return;
            node.getComponent(UITransform)?.setContentSize(tileWidth, tileHeight + 2);
            node.setPosition(
                0,
                parallaxBottom - scroll - visible.height / 2 + tileHeight / 2,
                0,
            );
            this.applySpriteVisual(node, frame);
        });
    }

    private selectBaseBackgroundFrame(
        worldBottom: number,
        worldTop: number,
    ): SpriteFrame | undefined {
        const { sky, cloud, star } = BACKGROUND_THEME_BOUNDARIES;
        if (worldBottom < sky && worldTop >= sky) {
            return this.textureFrames.transitionWarmSky;
        }
        if (worldBottom < cloud && worldTop >= cloud) {
            return this.textureFrames.transitionSkyCloud;
        }
        if (worldBottom < star && worldTop >= star) {
            return this.textureFrames.transitionCloudStar;
        }
        const center = (worldBottom + worldTop) / 2;
        if (center < sky) return this.textureFrames.backgroundWarm;
        if (center < cloud) return this.textureFrames.backgroundSky;
        if (center < star) return this.textureFrames.backgroundCloud;
        return this.textureFrames.backgroundStar;
    }

    private selectDecorFrames(worldY: number): readonly SpriteFrame[] {
        const { sky, cloud, star } = BACKGROUND_THEME_BOUNDARIES;
        const keys: readonly TextureKey[] = worldY < sky
            ? ['decorWarmBinder', 'decorWarmPushPin', 'decorWarmPaperclip', 'decorWarmPencilSpiral']
            : worldY < cloud
                ? ['decorSkySun', 'decorSkyKite', 'decorSkyRainbow', 'decorSkyWind']
                : worldY < star
                ? ['decorCloudLightning', 'decorCloudRain', 'decorCloudWarning', 'decorCloudMoonWind']
                : ['decorStarConstellation', 'decorStarMoon', 'decorStarPlanet', 'decorStarComet'];
        const frames: SpriteFrame[] = [];
        keys.forEach((key) => {
            const frame = this.textureFrames[key];
            if (frame) frames.push(frame);
        });
        return frames;
    }

    private positionRandomDecor(cameraBottomY: number, visible: Readonly<Size>): void {
        const factor = 0.28;
        const scroll = Math.max(0, cameraBottomY) * factor;
        this.ensureBackgroundDecorPlacements(scroll, visible);
        this.backgroundDecorNodes.forEach((node, slot) => {
            let index = this.backgroundDecorSeedIndices[slot];
            let parallaxY = this.backgroundDecorParallaxYs[slot];
            if (parallaxY - scroll < -180) {
                let highestParallaxY = scroll + visible.height + 180;
                this.backgroundDecorParallaxYs.forEach((candidate, candidateSlot) => {
                    if (candidateSlot !== slot) {
                        highestParallaxY = Math.max(highestParallaxY, candidate);
                    }
                });
                index = this.nextBackgroundDecorSeedIndex;
                this.nextBackgroundDecorSeedIndex += 1;
                parallaxY = highestParallaxY + 420 + this.decorRandom(index, 7) * 300;
                this.backgroundDecorSeedIndices[slot] = index;
                this.backgroundDecorParallaxYs[slot] = parallaxY;
            }
            const randomX = this.decorRandom(index, 1);
            const worldY = parallaxY / factor;
            const frames = this.selectDecorFrames(worldY);
            node.active = frames.length > 0;
            if (frames.length === 0) return;
            const frame = frames[Math.floor(this.decorRandom(index, 3) * frames.length)];
            const width = 88 + this.decorRandom(index, 4) * 62;
            const height = width
                * Math.max(1, frame.originalSize.height)
                / Math.max(1, frame.originalSize.width);
            node.getComponent(UITransform)?.setContentSize(width, height);
            const horizontalInset = Math.min(visible.width / 2, width / 2 + 12);
            node.setPosition(
                -visible.width / 2 + horizontalInset
                    + randomX * Math.max(1, visible.width - horizontalInset * 2),
                parallaxY - scroll - visible.height / 2,
                0,
            );
            node.setRotationFromEuler(0, 0, -14 + this.decorRandom(index, 5) * 28);
            const sprite = this.applySpriteVisual(node, frame);
        sprite.color = new Color(255, 255, 255, 128);
        });
    }

    private ensureBackgroundDecorPlacements(scroll: number, visible: Readonly<Size>): void {
        if (this.backgroundDecorParallaxYs.length === this.backgroundDecorNodes.length) return;
        this.backgroundDecorSeedIndices = [];
        this.backgroundDecorParallaxYs = [];
        this.nextBackgroundDecorSeedIndex = 0;
        let nextParallaxY = scroll + visible.height + 180;
        this.backgroundDecorNodes.forEach((_node, slot) => {
            const index = this.nextBackgroundDecorSeedIndex;
            this.nextBackgroundDecorSeedIndex += 1;
            this.backgroundDecorSeedIndices[slot] = index;
            this.backgroundDecorParallaxYs[slot] = nextParallaxY;
            nextParallaxY += 420 + this.decorRandom(index, 7) * 300;
        });
    }

    private decorRandom(index: number, salt: number): number {
        const session = this.context?.sessionId ?? 'doodle-jump';
        let hash = 2166136261;
        const value = `${session}:${index}:${salt}`;
        for (let cursor = 0; cursor < value.length; cursor += 1) {
            hash ^= value.charCodeAt(cursor);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    private visualQualityProfile(): DoodleJumpGameplayConfig['visualQuality']['medium'] {
        const tier = this.context?.services.deviceTier ?? 'medium';
        return this.config?.visualQuality[tier]
            ?? this.config?.visualQuality.medium
            ?? Object.freeze({
                decorNodeCount: 4,
                secondaryEffects: false,
                effectScale: 0.78,
                uiMotion: false,
                dynamicAtlasCount: 2,
                dynamicAtlasMaxFrameSize: 180,
            });
    }

    private configureDynamicAtlas(): void {
        if (this.dynamicAtlasBaseline) return;
        const manager = DynamicAtlasManager.instance;
        this.dynamicAtlasBaseline = Object.freeze({
            enabled: manager.enabled,
            maxAtlasCount: manager.maxAtlasCount,
            maxFrameSize: manager.maxFrameSize,
            textureSize: manager.textureSize,
            textureBleeding: manager.textureBleeding,
        });
        const profile = this.visualQualityProfile();
        manager.enabled = true;
        manager.textureSize = 1024;
        manager.maxAtlasCount = profile.dynamicAtlasCount;
        manager.maxFrameSize = profile.dynamicAtlasMaxFrameSize;
        manager.textureBleeding = true;
    }

    private restoreDynamicAtlas(): void {
        const baseline = this.dynamicAtlasBaseline;
        if (!baseline) return;
        const manager = DynamicAtlasManager.instance;
        manager.enabled = baseline.enabled;
        manager.textureSize = baseline.textureSize;
        manager.maxAtlasCount = baseline.maxAtlasCount;
        manager.maxFrameSize = baseline.maxFrameSize;
        manager.textureBleeding = baseline.textureBleeding;
        this.dynamicAtlasBaseline = undefined;
    }

    private updatePlayerVisual(
        horizontalVelocity = 0,
        itemStatus?: DoodleJumpItemStatusSnapshot,
    ): void {
        if (!this.playerNode || !this.config) return;
        if (horizontalVelocity < -8) this.playerFacing = -1;
        else if (horizontalVelocity > 8) this.playerFacing = 1;
        const frame = this.textureFrames.playerJumping;
        if (!frame) return;
        const visualHeight = 126;
        const visualWidth = visualHeight
            * Math.max(1, frame.originalSize.width)
            / Math.max(1, frame.originalSize.height);
        this.playerNode.getComponent(UITransform)?.setContentSize(visualWidth, visualHeight);
        this.applySpriteVisual(this.playerNode, frame);
        const visual = this.playerNode.getChildByName('SpriteVisual');
        visual?.setScale(this.playerFacing, 1, 1);
        const trampolineProgress = itemStatus?.trampolineJumpProgress ?? 0;
        const trampolineRotation = itemStatus?.trampolineJumpActive
            && trampolineProgress < 1
            ? -360 * TRAMPOLINE_ROTATION_TURNS * trampolineProgress
            : 0;
        visual?.setRotationFromEuler(
            0,
            0,
            trampolineRotation,
        );
        visual?.setPosition(
            0,
            visualHeight / 2 - this.config.player.collisionHeight / 2 - 4,
            0,
        );
    }

    private createPlayerItemVisuals(player: Node): void {
        const createEffect = (name: string, width: number, height: number): Node => {
            const effect = new Node(name);
            effect.layer = player.layer;
            effect.setParent(player);
            effect.addComponent(UITransform).setContentSize(width, height);
            effect.addComponent(UIOpacity).opacity = 255;
            const sprite = effect.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            effect.active = false;
            return effect;
        };
        this.playerMotionEffectNode = createEffect('PlayerMotionEffect', 126, 160);
        this.playerWrapEffectNode = createEffect('PlayerScreenWrapEffect', 180, 138);

        const power = new Node('PlayerPowerEffect');
        power.layer = player.layer;
        power.setParent(player);
        power.addComponent(UITransform).setContentSize(150, 160);
        const powerSprite = power.addComponent(Sprite);
        powerSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        power.active = false;
        this.playerPowerEffectNode = power;
        this.playerPowerSecondaryEffectNode = createEffect('PlayerPowerSecondaryEffect', 150, 170);

        const jetpack = new Node('PlayerJetpack');
        jetpack.layer = player.layer;
        jetpack.setParent(player);
        jetpack.addComponent(UITransform).setContentSize(76, 72);
        const jetpackSprite = jetpack.addComponent(Sprite);
        jetpackSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        jetpack.active = false;
        this.playerJetpackNode = jetpack;

        const rocket = new Node('PlayerRocket');
        rocket.layer = player.layer;
        rocket.setParent(player);
        rocket.addComponent(UITransform).setContentSize(123, 180);
        const rocketSprite = rocket.addComponent(Sprite);
        rocketSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        rocket.active = false;
        this.playerRocketNode = rocket;

        const propellerHatCap = new Node('PlayerPropellerHatCap');
        propellerHatCap.layer = player.layer;
        propellerHatCap.setParent(player);
        propellerHatCap.addComponent(UITransform).setContentSize(41, 36);
        const propellerHatCapSprite = propellerHatCap.addComponent(Sprite);
        propellerHatCapSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        propellerHatCap.active = false;
        this.playerPropellerHatCapNode = propellerHatCap;

        const propellerHatBlades = new Node('PlayerPropellerHatBlades');
        propellerHatBlades.layer = player.layer;
        propellerHatBlades.setParent(player);
        propellerHatBlades.addComponent(UITransform).setContentSize(55, 14);
        const propellerHatBladesSprite = propellerHatBlades.addComponent(Sprite);
        propellerHatBladesSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        propellerHatBlades.active = false;
        this.playerPropellerHatBladesNode = propellerHatBlades;

        const shield = new Node('ShieldOverlay');
        shield.layer = player.layer;
        shield.setParent(player);
        shield.addComponent(UITransform).setContentSize(150, 160);
        const shieldSprite = shield.addComponent(Sprite);
        shieldSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        shield.active = false;
        this.shieldOverlayNode = shield;
        this.shieldPulseNode = createEffect('ShieldPulseEffect', 168, 178);

    }

    private updatePlayerItemVisuals(
        status: DoodleJumpItemStatusSnapshot,
        elapsedSeconds: number,
        velocityY: number,
    ): void {
        const quality = this.visualQualityProfile();
        const jetpack = this.playerJetpackNode;
        const jetpackFrame = this.textureFrames.playerJetpack;
        if (jetpack?.isValid) {
            jetpack.active = status.flightPower === 'jetpack' && jetpackFrame !== undefined;
            if (jetpack.active && jetpackFrame) {
                jetpack.getComponent(Sprite)!.spriteFrame = jetpackFrame;
                jetpack.setPosition(-25 * this.playerFacing, 11, 0);
                jetpack.setScale(this.playerFacing, 1, 1);
                jetpack.setRotationFromEuler(0, 0, 0);
                jetpack.setSiblingIndex(0);
            }
        }
        const rocket = this.playerRocketNode;
        const rocketFrame = this.textureFrames.playerRocket;
        if (rocket?.isValid) {
            rocket.active = status.flightPower === 'rocket' && rocketFrame !== undefined;
            if (rocket.active && rocketFrame) {
                rocket.getComponent(Sprite)!.spriteFrame = rocketFrame;
                rocket.setPosition(0, 21, 0);
                rocket.setScale(this.playerFacing, 1, 1);
                rocket.setRotationFromEuler(0, 0, 0);
                rocket.setSiblingIndex(Math.max(0, rocket.parent!.children.length - 1));
            }
        }
        const propellerActive = status.flightPower === 'propeller-hat';
        const propellerHatCap = this.playerPropellerHatCapNode;
        const propellerHatCapFrame = this.textureFrames.playerPropellerHatCap;
        if (propellerHatCap?.isValid) {
            propellerHatCap.active = propellerActive && propellerHatCapFrame !== undefined;
            if (propellerHatCap.active && propellerHatCapFrame) {
                propellerHatCap.getComponent(Sprite)!.spriteFrame = propellerHatCapFrame;
                propellerHatCap.setPosition(-3 * this.playerFacing, 79, 0);
                propellerHatCap.setRotationFromEuler(0, 0, 0);
                propellerHatCap.setSiblingIndex(
                    Math.max(0, propellerHatCap.parent!.children.length - 1),
                );
            }
        }
        const propellerHatBlades = this.playerPropellerHatBladesNode;
        const propellerHatBladesFrame = this.textureFrames.playerPropellerHatBlades;
        if (propellerHatBlades?.isValid) {
            propellerHatBlades.active = propellerActive
                && propellerHatBladesFrame !== undefined;
            if (propellerHatBlades.active && propellerHatBladesFrame) {
                const bladesSprite = propellerHatBlades.getComponent(Sprite)!;
                bladesSprite.spriteFrame = propellerHatBladesFrame;
                propellerHatBlades.setPosition(-3 * this.playerFacing, 98, 0);
                propellerHatBlades.setRotationFromEuler(0, 0, 0);
                const projectedWidth = Math.cos(elapsedSeconds * Math.PI * 2 * 5);
                const facingScale = projectedWidth < 0 ? -1 : 1;
                const widthScale = facingScale * Math.max(0.08, Math.abs(projectedWidth));
                bladesSprite.color = projectedWidth < 0
                    ? new Color(220, 226, 230, 255)
                    : new Color(255, 255, 255, 255);
                propellerHatBlades.setScale(
                    widthScale,
                    0.94 + Math.abs(projectedWidth) * 0.06,
                    1,
                );
                propellerHatBlades.setSiblingIndex(
                    Math.max(0, propellerHatBlades.parent!.children.length - 1),
                );
            }
        }
        const motion = this.playerMotionEffectNode;
        if (motion?.isValid) {
            const motionKey: TextureKey | undefined = velocityY < -300
                ? 'playerFallDrag'
                : undefined;
            const motionFrame = motionKey ? this.textureFrames[motionKey] : undefined;
            motion.active = motionFrame !== undefined;
            if (motionFrame) {
                motion.getComponent(Sprite)!.spriteFrame = motionFrame;
                motion.setPosition(0, 22, 0);
                motion.setScale(
                    quality.effectScale * 0.72,
                    quality.effectScale * 0.72,
                    1,
                );
                motion.setSiblingIndex(0);
                const opacity = motion.getComponent(UIOpacity);
                if (opacity) opacity.opacity = quality.secondaryEffects ? 190 : 130;
            }
        }
        const wrap = this.playerWrapEffectNode;
        const wrapFrame = this.textureFrames.playerScreenWrap;
        if (wrap?.isValid) {
            wrap.active = this.wrapEffectRemaining > 0 && wrapFrame !== undefined;
            if (wrap.active && wrapFrame) {
                wrap.getComponent(Sprite)!.spriteFrame = wrapFrame;
                const progress = 1 - this.wrapEffectRemaining / 0.28;
                wrap.setScale(0.86 + progress * 0.2, 0.86 + progress * 0.2, 1);
                const opacity = wrap.getComponent(UIOpacity);
                if (opacity) opacity.opacity = Math.round(210 * (1 - progress));
                wrap.setSiblingIndex(0);
            }
        }
        const shield = this.shieldOverlayNode;
        const shieldFrame = this.textureFrames.shieldOverlay;
        if (shield?.isValid) {
            shield.active = status.shieldRemainingSeconds > 0 && shieldFrame !== undefined;
            if (shield.active && shieldFrame) {
                shield.getComponent(Sprite)!.spriteFrame = shieldFrame;
                shield.setPosition(0, 14, 0);
                shield.setScale(
                    1 + Math.sin(elapsedSeconds * 5) * 0.035,
                    1 + Math.sin(elapsedSeconds * 5) * 0.035,
                    1,
                );
                shield.setSiblingIndex(Math.max(0, shield.parent!.children.length - 1));
            }
        }
        const shieldPulse = this.shieldPulseNode;
        const shieldPulseFrame = this.textureFrames.shieldPulse;
        if (shieldPulse?.isValid) {
            shieldPulse.active = quality.secondaryEffects
                && status.shieldRemainingSeconds > 0
                && shieldPulseFrame !== undefined;
            if (shieldPulse.active && shieldPulseFrame) {
                shieldPulse.getComponent(Sprite)!.spriteFrame = shieldPulseFrame;
                shieldPulse.setPosition(0, 14, 0);
                const pulse = 0.9 + (Math.sin(elapsedSeconds * 5) + 1) * 0.08;
                shieldPulse.setScale(pulse * quality.effectScale, pulse * quality.effectScale, 1);
                shieldPulse.setSiblingIndex(Math.max(0, shieldPulse.parent!.children.length - 1));
                const opacity = shieldPulse.getComponent(UIOpacity);
                if (opacity) opacity.opacity = 82 + Math.round((Math.sin(elapsedSeconds * 5) + 1) * 38);
            }
        }
        const effect = this.playerPowerEffectNode;
        const secondary = this.playerPowerSecondaryEffectNode;
        if (secondary?.isValid) secondary.active = false;
        if (!effect?.isValid) return;
        const key = status.headStartRemainingSeconds > 0 ? 'headStartBurst'
            : status.flightPower === 'jetpack' ? 'jetpackFlames'
                : status.flightPower === 'rocket' ? 'rocketFlame'
                    : undefined;
        const frame = key ? this.textureFrames[key as TextureKey] : undefined;
        effect.active = frame !== undefined;
        if (!frame) return;
        effect.getComponent(Sprite)!.spriteFrame = frame;
        const width = status.flightPower === 'jetpack' ? 78 : 112;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        effect.getComponent(UITransform)?.setContentSize(width, height);
        effect.setPosition(
            0,
            status.flightPower === 'rocket'
                ? -76
                : status.flightPower === 'jetpack'
                    ? -43
                    : -56,
            0,
        );
        effect.setScale(1 + Math.sin(elapsedSeconds * 12) * 0.04, 1, 1);
        effect.setSiblingIndex(0);

        if (!secondary?.isValid) return;
        const secondaryKey: TextureKey | undefined = status.flightPower === 'jetpack'
            ? 'jetpackScraps'
            : status.flightPower === 'rocket'
                ? elapsedSeconds % 0.24 < 0.12 ? 'rocketScraps' : 'rocketTrail'
                : undefined;
        const secondaryFrame = secondaryKey && quality.secondaryEffects
            ? this.textureFrames[secondaryKey]
            : undefined;
        secondary.active = secondaryFrame !== undefined;
        if (secondaryFrame) {
            secondary.getComponent(Sprite)!.spriteFrame = secondaryFrame;
            const width = 124;
            const height = width
                * Math.max(1, secondaryFrame.originalSize.height)
                / Math.max(1, secondaryFrame.originalSize.width);
            secondary.getComponent(UITransform)?.setContentSize(width, height);
            secondary.setPosition(0, status.flightPower === 'rocket' ? -58 : -32, 0);
            secondary.setScale(quality.effectScale, quality.effectScale, 1);
            secondary.setSiblingIndex(0);
        }
    }

    private updateItemHud(
        status: DoodleJumpItemStatusSnapshot,
        playerVelocityY: number,
    ): void {
        const frameNode = this.itemStatusFrameNode;
        if (!frameNode?.isValid) return;
        const entries: Array<Readonly<{ iconKey: TextureKey; ratio?: number }>> = [];
        if (status.landingPower) {
            entries.push(Object.freeze({
                iconKey: status.landingPower === 'spring'
                    ? 'itemIconSpring'
                    : 'itemIconTrampoline',
            }));
        }
        if (status.headStartRemainingSeconds > 0) {
            entries.push(Object.freeze({
                iconKey: 'itemIconHeadStart',
                ratio: status.headStartRemainingSeconds
                    / Math.max(0.001, this.config?.items.headStart.durationSeconds ?? 1.2),
            }));
        } else if (status.flightPower) {
            const iconKey: TextureKey = status.flightPower === 'jetpack' ? 'itemIconJetpack'
                : status.flightPower === 'propeller-hat' ? 'itemIconPropellerHat'
                    : 'itemIconRocket';
            const duration = status.flightPower === 'jetpack'
                ? this.config?.items.jetpack.durationSeconds ?? 1.8
                : status.flightPower === 'propeller-hat'
                    ? this.config?.items.propellerHat.durationSeconds ?? 1.8
                    : this.config?.items.rocket.durationSeconds ?? 1.8;
            const coastVelocity = status.flightPower === 'jetpack'
                ? this.config?.items.jetpack.verticalVelocity ?? 0
                : status.flightPower === 'propeller-hat'
                    ? this.config?.items.propellerHat.minimumVerticalVelocity ?? 0
                    : this.config?.items.rocket.verticalVelocity ?? 0;
            const gravityMagnitude = Math.max(1, Math.abs(this.config?.player.gravity ?? -1590));
            const coastSeconds = coastVelocity / gravityMagnitude;
            const completeAscentSeconds = duration + coastSeconds;
            const displayRemainingSeconds = status.flightRemainingSeconds > 0
                ? status.flightRemainingSeconds + coastSeconds
                : Math.max(0, playerVelocityY) / gravityMagnitude;
            entries.push(Object.freeze({
                iconKey,
                ratio: displayRemainingSeconds / Math.max(0.001, completeAscentSeconds),
            }));
        }
        if (status.shieldRemainingSeconds > 0) {
            entries.push(Object.freeze({
                iconKey: 'itemIconShield',
                ratio: status.shieldRemainingSeconds
                    / Math.max(0.001, this.config?.items.shield.durationSeconds ?? 6),
            }));
        }
        frameNode.active = entries.length > 0 && this.stateMachine.state === 'Playing';
        let cursorX = 0;
        this.itemStatusSlots.forEach((slot, index) => {
            const entry = entries[index];
            slot.root.active = entry !== undefined;
            if (!entry) return;
            const timed = entry.ratio !== undefined;
            const slotWidth = timed ? 170 : 54;
            slot.root.setPosition(cursorX + slotWidth / 2, 0, 0);
            slot.icon.spriteFrame = this.textureFrames[entry.iconKey] ?? null;
            slot.icon.node.setPosition(timed ? -61 : 0, 0, 0);
            slot.track.active = timed;
            if (timed) {
                slot.fill.getComponent(Sprite)!.spriteFrame = this.textureFrames.hudItemProgressFill ?? null;
                slot.fill.setScale(
                    Math.max(0.025, Math.min(1, entry.ratio ?? 0)),
                    1,
                    1,
                );
            }
            cursorX += slotWidth + 8;
        });
    }

    private captureLandingEffect(
        snapshot: ReturnType<DoodleJumpSimulation['getSnapshot']>,
    ): void {
        if (!this.config || snapshot.landingCount <= this.observedLandingCount) return;
        this.observedLandingCount = snapshot.landingCount;
        const platform = snapshot.platforms.find((candidate) => (
            candidate.id === snapshot.lastLandedPlatformId
        ));
        if (platform && this.context) {
            this.context.services.feedback.play('drop', { vibrate: false });
            this.context.services.analytics.track('doodle_jump_platform_land', {
                sessionId: this.context.sessionId,
                platformType: platform.type,
            });
        }
        this.landingDebrisWorldX = snapshot.playerX;
        this.landingDebrisWorldY = platform?.y
            ?? snapshot.playerY - this.config.player.collisionHeight / 2;
        this.landingDebrisRemaining = LANDING_DEBRIS_DURATION;
    }

    private renderLandingEffect(cameraCenterY: number, centerX: number): void {
        const effect = this.landingDebrisRoot;
        if (!effect?.isValid || this.landingDebrisRemaining <= 0) {
            if (effect?.isValid) effect.active = false;
            return;
        }
        effect.active = true;
        const elapsed = LANDING_DEBRIS_DURATION - this.landingDebrisRemaining;
        const progress = elapsed / LANDING_DEBRIS_DURATION;
        effect.setPosition(
            this.landingDebrisWorldX - centerX,
            this.landingDebrisWorldY - cameraCenterY,
            0,
        );
        const fadeProgress = Math.max(0, (progress - 0.18) / 0.82);
        const opacity = Math.max(0, Math.round(255 * Math.pow(1 - fadeProgress, 1.25)));
        this.landingDebrisVisuals.forEach((visual) => {
            if (!visual.isValid) return;
            const scale = 0.72 + progress * 0.36;
            const visualHeight = visual.getComponent(UITransform)?.contentSize.height ?? 0;
            visual.setPosition(
                0,
                visualHeight * scale / 2,
                0,
            );
            visual.setScale(scale, scale, 1);
            const fade = visual.getComponent(UIOpacity);
            if (fade) fade.opacity = opacity;
        });
    }

    private createLandingDebrisEffect(): void {
        if (!this.worldRoot) return;
        const root = new Node('LandingPaperDebrisEffect');
        root.layer = this.node.layer;
        root.setParent(this.worldRoot);
        root.addComponent(UITransform).setContentSize(220, 130);
        root.active = false;
        this.landingDebrisVisuals = [0].map((index) => {
            const visual = new Node(`LandingPaperScraps-${index}`);
            visual.layer = this.node.layer;
            visual.setParent(root);
            visual.addComponent(UITransform).setContentSize(172, 91);
            visual.addComponent(UIOpacity).opacity = 0;
            return visual;
        });
        this.landingDebrisRoot = root;
    }

    private createPlayerContactEffect(player: Node): void {
        const effect = new Node('PlayerEnemyContactImpact');
        effect.layer = player.layer;
        effect.setParent(player);
        effect.addComponent(UITransform).setContentSize(220, 220);
        effect.addComponent(UIOpacity).opacity = 0;
        effect.active = false;
        this.playerContactEffectNode = effect;
    }

    private createHazardFailureEffect(player: Node): void {
        const effect = new Node('PlayerHazardFailureEffect');
        effect.layer = player.layer;
        effect.setParent(player);
        effect.addComponent(UITransform).setContentSize(190, 190);
        effect.addComponent(UIOpacity).opacity = 255;
        effect.active = false;
        this.failureHazardEffectNode = effect;
    }

    private startHazardFailureEffect(reason: DoodleJumpFailureReason): void {
        const effect = this.failureHazardEffectNode;
        if (!effect?.isValid) return;
        const frame = reason === 'ufo-abduction'
            ? this.textureFrames.failureUfoCapture
            : reason === 'black-hole'
                ? this.textureFrames.failureBlackHoleSuction
                : reason === 'bear-trap' || reason === 'spikes'
                    ? this.textureFrames.failureBearTrapTrigger
                    : reason === 'fall'
                        ? this.textureFrames.failureFalling
                        : undefined;
        effect.active = frame !== undefined;
        if (!frame) return;
        const width = reason === 'black-hole' ? 210 : 184;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        effect.getComponent(UITransform)?.setContentSize(width, height);
        this.applySpriteVisual(effect, frame);
        effect.setPosition(
            0,
            reason === 'bear-trap' || reason === 'spikes' ? -34 : reason === 'fall' ? 8 : 4,
            0,
        );
        effect.setScale(0.92, 0.92, 1);
        effect.setRotationFromEuler(0, 0, 0);
        effect.setSiblingIndex(Math.max(0, effect.parent!.children.length - 1));
        const opacity = effect.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
    }

    private updateHazardFailureEffect(): void {
        const effect = this.failureHazardEffectNode;
        if (!effect?.isValid || !effect.active) return;
        const pulse = 0.92 + Math.sin(this.failureDropElapsed * 12) * 0.04;
        if (this.failureAnimationReason === 'fall') {
            effect.setScale(pulse, 0.92 + this.failureDropElapsed * 0.14, 1);
            effect.setRotationFromEuler(0, 0, Math.sin(this.failureDropElapsed * 8) * 2);
        } else if (this.failureAnimationReason === 'black-hole') {
            effect.setScale(pulse, pulse, 1);
            effect.setRotationFromEuler(0, 0, this.failureDropElapsed * 90);
        } else {
            effect.setScale(pulse, pulse, 1);
        }
    }

    private resetPlayerFailureVisual(): void {
        if (this.playerNode?.isValid) {
            this.playerNode.setScale(1, 1, 1);
            this.playerNode.setRotationFromEuler(0, 0, 0);
            const opacity = this.playerNode.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
        }
        if (this.failureHazardEffectNode?.isValid) {
            this.failureHazardEffectNode.active = false;
        }
    }

    private failureReasonText(reason: DoodleJumpFailureReason): string {
        if (reason === 'monster-contact') return '撞到了怪物';
        if (reason === 'ufo-abduction') return '被 UFO 光束带走';
        if (reason === 'black-hole') return '被黑洞吸入';
        if (reason === 'bear-trap') return '触发了捕兽夹';
        if (reason === 'spikes') return '撞到了平台下方的倒刺';
        return '没有落到下一块平台';
    }

    private startPlayerContactEffect(): void {
        const effect = this.playerContactEffectNode;
        if (!effect?.isValid) return;
        this.playerContactEffectRemaining = PLAYER_CONTACT_IMPACT_DURATION;
        effect.active = true;
        effect.setPosition(0, 18, 0);
        effect.setScale(0.78, 0.78, 1);
        effect.setRotationFromEuler(0, 0, -5);
        effect.setSiblingIndex(Math.max(0, effect.parent!.children.length - 1));
        const opacity = effect.getComponent(UIOpacity);
        if (opacity) opacity.opacity = 255;
    }

    private updatePlayerContactEffect(deltaTime: number): void {
        const effect = this.playerContactEffectNode;
        if (!effect?.isValid || this.playerContactEffectRemaining <= 0) {
            if (effect?.isValid) effect.active = false;
            return;
        }
        this.playerContactEffectRemaining = Math.max(
            0,
            this.playerContactEffectRemaining - deltaTime,
        );
        const progress = 1
            - this.playerContactEffectRemaining / PLAYER_CONTACT_IMPACT_DURATION;
        const scale = 0.78 + progress * 0.5;
        effect.setScale(scale, scale, 1);
        effect.setRotationFromEuler(0, 0, -5 + progress * 10);
        effect.setPosition(0, 18 + progress * 16, 0);
        effect.setSiblingIndex(Math.max(0, effect.parent!.children.length - 1));
        const fadeProgress = Math.max(0, (progress - 0.28) / 0.72);
        const opacity = effect.getComponent(UIOpacity);
        if (opacity) opacity.opacity = Math.max(0, Math.round(255 * (1 - fadeProgress)));
        if (this.playerContactEffectRemaining <= 0) effect.active = false;
    }

    private applySpriteVisual(node: Node, frame: SpriteFrame): Sprite {
        const fallback = node.getComponent(Graphics);
        if (fallback) fallback.enabled = false;
        let visual = node.getChildByName('SpriteVisual');
        if (!visual) {
            visual = new Node('SpriteVisual');
            visual.layer = node.layer;
            visual.setParent(node);
            visual.addComponent(UITransform);
        }
        const parentSize = node.getComponent(UITransform)?.contentSize;
        if (parentSize) {
            visual.getComponent(UITransform)?.setContentSize(parentSize.width, parentSize.height);
        }
        const sprite = visual.getComponent(Sprite) ?? visual.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = this.slicedFrames.has(frame) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;
        return sprite;
    }

    private syncSpriteVisualSize(node: Node): void {
        const visual = node.getChildByName('SpriteVisual');
        const parentSize = node.getComponent(UITransform)?.contentSize;
        if (!visual || !parentSize) return;
        visual.getComponent(UITransform)?.setContentSize(parentSize.width, parentSize.height);
    }

    private getSpriteVisual(node: Node): Sprite | null {
        return node.getChildByName('SpriteVisual')?.getComponent(Sprite) ?? null;
    }

    private createOverlay(
        name: string,
        title: string,
        message: string,
        panelKey: TextureKey = 'panelReady',
        layer: 'flow' | 'pause' = 'flow',
        animatePanel = true,
        panelHeight = 590,
    ): Node {
        const targetRoot = layer === 'pause' ? this.pauseOverlayRoot : this.flowOverlayRoot;
        if (!targetRoot) throw new Error(`${layer} overlay root is unavailable.`);
        if (this.overlayRoot?.isValid) this.overlayRoot.active = true;
        const visible = view.getVisibleSize();
        const layout = this.context?.services.platform.getLayoutInfo();
        const safe = calculateVerticalSafeBounds(visible.height, layout, 18);
        const availableHeight = Math.max(1, safe.topY - safe.bottomY - 32);
        const panelScale = Math.min(1, availableHeight / panelHeight);
        const backdrop = this.createGraphicsNode(
            targetRoot,
            `${name}-Backdrop`,
            visible.width,
            visible.height,
        );
        const backdropGraphics = backdrop.getComponent(Graphics)!;
        backdropGraphics.fillColor = new Color(30, 35, 37, 112);
        backdropGraphics.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        backdropGraphics.fill();
        const panel = this.createGraphicsNode(
            targetRoot,
            name,
            Math.min(560, visible.width - 70),
            panelHeight,
        );
        panel.setPosition(0, (safe.topY + safe.bottomY) / 2, 0);
        panel.setScale(panelScale, panelScale, 1);
        if (animatePanel && this.visualQualityProfile().uiMotion) {
            panel.setScale(panelScale * 0.94, panelScale * 0.94, 1);
            const panelOpacity = panel.addComponent(UIOpacity);
            panelOpacity.opacity = 0;
            tween(panel)
                .to(0.16, { scale: new Vec3(panelScale, panelScale, 1) }, { easing: 'quadOut' })
                .start();
            tween(panelOpacity).to(0.12, { opacity: 255 }).start();
        }
        const width = panel.getComponent(UITransform)!.contentSize.width;
        const halfPanelHeight = panelHeight / 2;
        const graphics = panel.getComponent(Graphics)!;
        graphics.fillColor = COLORS.paperOverlay;
        graphics.roundRect(-width / 2, -halfPanelHeight, width, panelHeight, 32);
        graphics.fill();
        graphics.strokeColor = COLORS.ink;
        graphics.lineWidth = 5;
        graphics.roundRect(-width / 2, -halfPanelHeight, width, panelHeight, 32);
        graphics.stroke();
        const panelFrame = this.textureFrames[panelKey];
        if (panelFrame) {
            const sprite = this.applySpriteVisual(panel, panelFrame);
            sprite.node.setSiblingIndex(0);
        }
        if (title.length > 0) {
            this.createLabel(
                panel,
                'Title',
                title,
                0,
                halfPanelHeight - 90,
                38,
                COLORS.ink,
                width - 90,
                64,
            );
        }
        if (message.length > 0) {
            const messageLabel = this.createLabel(
                panel,
                'Message',
                message,
                0,
                halfPanelHeight - 158,
                22,
                COLORS.muted,
                width - 90,
                92,
            );
            messageLabel.overflow = Label.Overflow.SHRINK;
        }
        return panel;
    }

    private createButton(
        parent: Node,
        text: string,
        x: number,
        y: number,
        width: number,
        height: number,
        action: () => void,
        style: 'primary' | 'secondary' | 'danger' = 'primary',
        iconKey?: TextureKey,
        showRewardedVideoIcon = false,
    ): Node {
        const button = this.createGraphicsNode(parent, `Button-${text}`, width, height);
        button.setPosition(x, y, 0);
        const graphics = button.getComponent(Graphics)!;
        graphics.fillColor = style === 'primary' ? COLORS.teal
            : style === 'danger' ? COLORS.coral
                : COLORS.paper;
        graphics.roundRect(-width / 2, -height / 2, width, height, 20);
        graphics.fill();
        graphics.strokeColor = style === 'danger' ? COLORS.coral : COLORS.tealDark;
        graphics.lineWidth = 4;
        graphics.roundRect(-width / 2, -height / 2, width, height, 20);
        graphics.stroke();
        const hasTextureIcon = iconKey !== undefined && this.textureFrames[iconKey] !== undefined;
        const hasRewardedIcon = showRewardedVideoIcon
            && this.rewardedVideoIconFrame !== undefined;
        const hasIcon = hasTextureIcon || hasRewardedIcon;
        const label = this.createLabel(
            button,
            'Label',
            text,
            hasIcon ? 20 : 0,
            0,
            27,
            style === 'primary' || style === 'danger' ? COLORS.paper : COLORS.tealDark,
            width - (hasIcon ? 78 : 20),
            height - 10,
        );
        if (hasTextureIcon && iconKey) {
            this.createSpriteNode(
                button,
                'ButtonIcon',
                this.textureFrames[iconKey]!,
                42,
                42,
                -width / 2 + 42,
                0,
            );
        } else if (hasRewardedIcon) {
            const iconHeight = 32;
            const iconWidth = iconHeight * DOODLE_JUMP_REWARDED_VIDEO_ICON_ASPECT;
            const icon = attachDoodleJumpAdIcon(
                button,
                this.rewardedVideoIconFrame,
                0,
                0,
                iconWidth,
                iconHeight,
            );
            layoutDoodleJumpAdIconBeforeLabel(
                icon,
                label,
                text,
                27,
                iconWidth,
                iconHeight,
                width,
                4,
            );
        }
        if (this.isNodeWithin(parent, this.pauseOverlayRoot)) {
            this.pauseOverlayButtons.push(button);
        } else if (this.isNodeWithin(parent, this.flowOverlayRoot)) {
            this.overlayButtons.push(button);
        }
        const invoke = (): void => {
            if (this.disabledButtons.has(button)) return;
            const now = Date.now();
            if (now - this.lastButtonActionAt < 240) return;
            this.lastButtonActionAt = now;
            this.context?.services.feedback.play('uiButton');
            action();
        };
        button.on(Node.EventType.TOUCH_START, (event: { propagationStopped?: boolean }) => {
            event.propagationStopped = true;
        }, this);
        button.on(Node.EventType.TOUCH_END, (event: { propagationStopped?: boolean }) => {
            event.propagationStopped = true;
            invoke();
        }, this);
        button.on(Node.EventType.MOUSE_DOWN, (event: { propagationStopped?: boolean }) => {
            event.propagationStopped = true;
        }, this);
        button.on(Node.EventType.MOUSE_UP, (event: { propagationStopped?: boolean }) => {
            event.propagationStopped = true;
            invoke();
        }, this);
        return button;
    }

    private isNodeWithin(node: Node | undefined, ancestor: Node | undefined): boolean {
        if (!node?.isValid || !ancestor?.isValid) return false;
        let current: Node | null = node;
        while (current) {
            if (current === ancestor) return true;
            current = current.parent;
        }
        return false;
    }

    private setButtonEnabled(button: Node, enabled: boolean): void {
        if (enabled) this.disabledButtons.delete(button);
        else this.disabledButtons.add(button);
        const graphics = button.getComponent(Graphics);
        if (graphics) {
            const size = button.getComponent(UITransform)?.contentSize;
            if (size) {
                graphics.clear();
                graphics.fillColor = enabled ? COLORS.teal : new Color(148, 148, 142, 220);
                graphics.strokeColor = enabled ? COLORS.tealDark : COLORS.muted;
                graphics.lineWidth = 4;
                graphics.roundRect(-size.width / 2, -size.height / 2, size.width, size.height, 20);
                graphics.fill();
                graphics.stroke();
            }
        }
        const label = button.getChildByName('Label')?.getComponent(Label);
        if (label) label.color = enabled ? COLORS.paper : new Color(229, 225, 212, 255);
        const icon = button.getChildByName('ButtonIcon')?.getComponent(Sprite);
        if (icon) icon.color = enabled ? Color.WHITE : new Color(170, 170, 164, 255);
        const rewardedIcon = button.getChildByName('DoodleJumpRewardedVideoIcon')?.getComponent(Sprite);
        if (rewardedIcon) {
            rewardedIcon.color = enabled ? Color.WHITE : new Color(170, 170, 164, 255);
        }
    }

    private setOverlayButtonsEnabled(enabled: boolean): void {
        this.overlayButtons.forEach((button) => {
            if (button.isValid) this.setButtonEnabled(button, enabled);
        });
    }

    private createSpriteNode(
        parent: Node,
        name: string,
        frame: SpriteFrame,
        width: number,
        height: number,
        x = 0,
        y = 0,
    ): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = this.slicedFrames.has(frame) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;
        return node;
    }

    private createGraphicsNode(parent: Node, name: string, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.addComponent(UITransform).setContentSize(width, height);
        node.addComponent(Graphics);
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
        const node = new Node(name);
        node.layer = this.node.layer;
        node.setParent(parent);
        node.setPosition(x, y, 0);
        node.addComponent(UITransform).setContentSize(width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = Math.round(fontSize * 1.3);
        label.color = color;
        label.horizontalAlign = 1;
        label.verticalAlign = 1;
        return label;
    }

    private loadJsonAsset(path: string): Promise<JsonAsset> {
        const bundle = assetManager.getBundle(DOODLE_JUMP_BUNDLE);
        if (!bundle) return Promise.reject(new Error(`Bundle ${DOODLE_JUMP_BUNDLE} is unavailable.`));
        return new Promise<JsonAsset>((resolve, reject) => {
            bundle.load(path, JsonAsset, (error, asset) => {
                if (error || !asset) reject(error ?? new Error(`Missing asset ${path}.`));
                else resolve(asset);
            });
        });
    }

    private loadTexture(path: string): Promise<Texture2D> {
        const bundle = assetManager.getBundle(DOODLE_JUMP_RESOURCE_BUNDLE);
        if (!bundle) return Promise.reject(new Error(`Bundle ${DOODLE_JUMP_RESOURCE_BUNDLE} is unavailable.`));
        return new Promise<Texture2D>((resolve, reject) => {
            bundle.load(path, Texture2D, (error, asset) => {
                if (error || !asset) reject(error ?? new Error(`Missing asset ${path}.`));
                else resolve(asset);
            });
        });
    }

    private async loadRewardedVideoIcon(): Promise<SpriteFrame | undefined> {
        try {
            const texture = await this.loadTexture(DOODLE_JUMP_REWARDED_VIDEO_ICON_PATH);
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.packable = false;
            frame.rect = new Rect(0, 0, texture.width, texture.height);
            frame.originalSize = new Size(texture.width, texture.height);
            return frame;
        } catch (error: unknown) {
            console.warn('[DoodleJumpGame] Rewarded video icon unavailable.', error);
            return undefined;
        }
    }

    private clearTextureReferences(): void {
        const root = this.dynamicRoot;
        if (!root?.isValid) return;
        const clearNode = (node: Node): void => {
            const sprite = node.getComponent(Sprite);
            if (sprite) sprite.spriteFrame = null;
            node.children.slice().forEach(clearNode);
        };
        clearNode(root);
    }

    private destroyPresentation(): void {
        this.resetShootingRuntime();
        this.clearCombatVisuals();
        this.node.off(Node.EventType.TOUCH_START, this.handleGameplayTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.handleGameplayTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.handleGameplayRelease, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.handleGameplayTouchCancel, this);
        this.node.off(Node.EventType.MOUSE_DOWN, this.handleGameplayMouseDown, this);
        this.node.off(Node.EventType.MOUSE_MOVE, this.handleGameplayMouseMove, this);
        this.node.off(Node.EventType.MOUSE_UP, this.handleGameplayMouseRelease, this);
        const root = this.dynamicRoot;
        if (root?.isValid) {
            root.active = false;
            root.destroy();
        }
        this.dynamicRoot = undefined;
        this.backgroundRoot = undefined;
        this.backgroundBaseNodes = [];
        this.backgroundDecorNodes = [];
        this.backgroundDecorSeedIndices = [];
        this.backgroundDecorParallaxYs = [];
        this.nextBackgroundDecorSeedIndex = 0;
        this.worldRoot = undefined;
        this.uiRoot = undefined;
        this.overlayRoot = undefined;
        this.flowOverlayRoot = undefined;
        this.pauseOverlayRoot = undefined;
        this.routeDebugNode = undefined;
        this.playerNode = undefined;
        this.playerMotionEffectNode = undefined;
        this.playerWrapEffectNode = undefined;
        this.playerJetpackNode = undefined;
        this.playerRocketNode = undefined;
        this.playerPropellerHatCapNode = undefined;
        this.playerPropellerHatBladesNode = undefined;
        this.playerPowerSecondaryEffectNode = undefined;
        this.shieldPulseNode = undefined;
        this.previousRenderedPlayerX = undefined;
        this.wrapEffectRemaining = 0;
        this.playerContactEffectNode = undefined;
        this.failureHazardEffectNode = undefined;
        this.failureFocusHazardNode = undefined;
        this.playerContactEffectRemaining = 0;
        this.landingDebrisRoot = undefined;
        this.landingDebrisVisuals = [];
        this.landingDebrisRemaining = 0;
        this.observedLandingCount = 0;
        this.aimReticleNode = undefined;
        this.platformNodes = [];
        this.platformNodeTypes = [];
        this.enemyNodes = [];
        this.enemyNodeTypes = [];
        this.hazardNodes = [];
        this.hazardNodeTypes = [];
        this.itemNodes = [];
        this.itemNodeTypes = [];
        this.shieldOverlayNode = undefined;
        this.playerPowerEffectNode = undefined;
        this.itemEffectNode = undefined;
        this.itemEffectRemaining = 0;
        this.itemEffectKey = undefined;
        this.flightPowerDropRoot = undefined;
        this.flightPowerDropBodyNode = undefined;
        this.flightPowerDropCapNode = undefined;
        this.flightPowerDropBladesNode = undefined;
        this.flightPowerDropType = undefined;
        this.flightPowerDropElapsed = 0;
        this.flightPowerDropWorldX = 0;
        this.flightPowerDropWorldY = 0;
        this.flightPowerDropVelocityX = 0;
        this.flightPowerDropVelocityY = 0;
        this.flightPowerDropRotation = 0;
        this.flightPowerDropAngularVelocity = 0;
        this.titleLabel = undefined;
        this.statusLabel = undefined;
        this.heightLabel = undefined;
        this.scoreLabel = undefined;
        this.scoreCardNode = undefined;
        this.heightCardNode = undefined;
        this.itemStatusFrameNode = undefined;
        this.itemStatusSlots = [];
        this.debugLabel = undefined;
        this.pauseButton = undefined;
        this.rulesButton = undefined;
        this.singleStepButton = undefined;
        this.overlayButtons = [];
        this.pauseOverlayButtons = [];
        this.disabledButtons.clear();
    }

    private destroyOverlay(): void {
        this.overlayButtons.forEach((button) => this.disabledButtons.delete(button));
        this.overlayButtons = [];
        this.flowOverlayRoot?.children.slice().forEach((child) => {
            child.active = false;
            child.destroy();
        });
        if (!this.layerHasActiveChildren(this.pauseOverlayRoot) && this.overlayRoot?.isValid) {
            this.overlayRoot.active = false;
        }
    }

    private destroyPauseOverlay(): void {
        this.pauseOverlayButtons.forEach((button) => this.disabledButtons.delete(button));
        this.pauseOverlayButtons = [];
        this.pauseOverlayRoot?.children.slice().forEach((child) => {
            child.active = false;
            child.destroy();
        });
        if (!this.layerHasActiveChildren(this.flowOverlayRoot) && this.overlayRoot?.isValid) {
            this.overlayRoot.active = false;
        }
    }

    private hasVisibleOverlay(): boolean {
        return this.layerHasActiveChildren(this.flowOverlayRoot)
            || this.layerHasActiveChildren(this.pauseOverlayRoot);
    }

    private layerHasActiveChildren(root: Node | undefined): boolean {
        return root?.children.some((child) => child.isValid && child.active) === true;
    }

    private countDynamicNodes(): number {
        const count = (node: Node): number => 1 + node.children.reduce(
            (total, child) => total + count(child),
            0,
        );
        return this.dynamicRoot?.isValid ? count(this.dynamicRoot) : 0;
    }

    private countOwnedListeners(): number {
        const inputListeners = this.inputController?.getDebugState().listenerCount ?? 0;
        const platformListeners = (this.hideUnsubscribe ? 1 : 0) + (this.showUnsubscribe ? 1 : 0);
        const rootListeners = this.dynamicRoot?.isValid ? 14 : 0;
        const resizeListeners = this.resizeBound ? 1 : 0;
        const countButtons = (node: Node): number => (
            (node.name.indexOf('Button-') === 0 ? 1 : 0)
            + node.children.reduce((total, child) => total + countButtons(child), 0)
        );
        const buttonListeners = this.dynamicRoot?.isValid ? countButtons(this.dynamicRoot) * 4 : 0;
        return inputListeners + platformListeners + rootListeners + resizeListeners + buttonListeners;
    }

    private isGenerationCurrent(generation: number): boolean {
        return generation === this.lifecycleGeneration
            && this.stateMachine.state !== 'Disposed';
    }

    private readonly handleGameplayTouchStart = (event: EventTouch): void => {
        if (this.stateMachine.state !== 'Playing' || this.attackPointerId !== undefined) return;
        const location = event.getUILocation();
        if (!this.isGameplayPointerAllowed(location.x, location.y)) return;
        this.lastTouchStartAt = Date.now();
        this.attackPointerId = event.getID();
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
        this.tryFirePaperPlane();
    };

    private readonly handleGameplayTouchMove = (event: EventTouch): void => {
        if (this.stateMachine.state !== 'Playing'
            || this.attackPointerId !== event.getID()) return;
        const location = event.getUILocation();
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
    };

    private readonly handleGameplayRelease = (event: EventTouch): void => {
        this.lastPointerReleaseAt = Date.now();
        if (this.attackPointerId === event.getID()) this.cancelAttack(true);
    };

    private readonly handleGameplayTouchCancel = (event: EventTouch): void => {
        if (this.attackPointerId === event.getID()) this.cancelAttack(true);
    };

    private readonly handleGameplayMouseDown = (event: EventMouse): void => {
        if (Date.now() - this.lastTouchStartAt < 500
            || this.stateMachine.state !== 'Playing'
            || this.attackPointerId !== undefined) return;
        const location = event.getUILocation();
        if (!this.isGameplayPointerAllowed(location.x, location.y)) return;
        this.mouseAttackHeld = true;
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
        this.tryFirePaperPlane();
    };

    private readonly handleGameplayMouseMove = (event: EventMouse): void => {
        if (!this.mouseAttackHeld || this.stateMachine.state !== 'Playing') return;
        const location = event.getUILocation();
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
    };

    private readonly handleGameplayMouseRelease = (): void => {
        if (Date.now() - this.lastPointerReleaseAt < 500) return;
        if (this.mouseAttackHeld) this.cancelAttack(true);
    };

    private readonly handleOverlayInput = (event: { propagationStopped?: boolean }): void => {
        if (this.hasVisibleOverlay()) event.propagationStopped = true;
    };

    private isGameplayPointerAllowed(uiX: number, uiY: number): boolean {
        if (!this.context) return false;
        const visible = view.getVisibleSize();
        const safe = calculateVerticalSafeBounds(
            visible.height,
            this.context.services.platform.getLayoutInfo(),
            18,
        );
        const centeredY = uiY - visible.height / 2;
        if (centeredY < safe.bottomY || centeredY > safe.topY) return false;
        if (centeredY > safe.topY - 170) return false;
        return uiX >= 0 && uiX <= visible.width;
    }

    private readonly handlePlatformHide = (): void => {
        // Failing/ResurrectPrompt 已在状态改变时同步保存。此时只 flush 待写
        // 队列，不能再次以不可恢复状态重建存档并清掉 activeRound。
        if (this.stateMachine.state === 'Failing'
            || this.stateMachine.state === 'ResurrectPrompt'
            || this.stateMachine.state === 'Resurrecting') {
            try {
                this.context?.services.storage.flush();
            } catch (error: unknown) {
                console.error('[DoodleJumpGame] Storage flush failed on platform hide.', error);
            }
            return;
        }
        this.persistCurrentRunHistory(false, true);
        if (this.stateMachine.state === 'Playing') {
            this.cancelAttack(true);
            this.context?.requestPause();
        }
    };

    private readonly handlePlatformShow = (): void => {
        if (this.stateMachine.state === 'Playing' && this.inputController?.hasStaleSensor()) {
            this.enterSensorError('返回前台后没有新的重力感应数据');
        }
    };

    private readonly handleCanvasResize = (): void => {
        if (this.stateMachine.state === 'Disposed' || !this.context) return;
        const pauseModel = this.activePauseModel;
        const resultModel = this.activeResultModel;
        const wasTutorialActive = this.tutorialActive;
        const wasHeadStartPromptActive = this.headStartPromptActive;
        const wasSensorCalibrationVisible = this.sensorCalibrationVisible;
        const wasMissingResourceActive = this.missingResourceActive;
        const statusText = this.statusLabel?.string ?? this.stateMachine.state;
        this.buildPresentation();
        this.applyVisualAssets();
        this.setGameplayPresentationVisible(this.stateMachine.state !== 'Loading');
        if (this.stateMachine.state === 'Loading') this.showLoadingOverlay();
        else if (resultModel) this.showResultView(resultModel);
        else if (this.stateMachine.state === 'ResurrectPrompt') this.showResurrectionPrompt();
        else if (wasTutorialActive && this.tutorialOpenedFromHud) this.showTutorialStep();
        else if (this.stateMachine.state === 'SensorCalibrating') {
            if (wasTutorialActive) this.showTutorialStep();
            else if (wasHeadStartPromptActive) this.showHeadStartPrompt();
            else if (wasSensorCalibrationVisible) this.showSensorCalibrationOverlay();
        } else if (this.stateMachine.state === 'Error') {
            if (wasMissingResourceActive) this.showMissingResourceView();
            else this.showSensorErrorView(this.lastErrorMessage || '重力感应不可用');
        }
        if (pauseModel) this.showPauseMenu(pauseModel);
        this.updatePresentationState(statusText);
    };
}
