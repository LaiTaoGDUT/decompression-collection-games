import { PACKED_SPRITE_PATHS } from './PackedSpritePaths';
import type { DoodleJumpCollectibleEvent } from './DoodleJumpCollectibleSystem';
import {
    _decorator,
    assetManager,
    Canvas,
    Camera,
    Color,
    Component,
    EventMouse,
    EventTouch,
    Graphics,
    input,
    Input,
    JsonAsset,
    Label,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    Size,
    Texture2D,
    UIOpacity,
    UITransform,
    Vec3,
    Tween,
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
import type { AssetService } from '../../../services/asset/AssetService';
import type { AudioService } from '../../../services/audio/AudioService';
import { BundleAudioBank } from '../../../services/audio/BundleAudioBank';
import type { FeedbackService } from '../../../services/feedback/FeedbackService';
import type { StorageService } from '../../../services/storage/StorageService';
import {
    calculateVerticalSafeBounds,
} from '../../../shared/ui/PlatformSafeLayout';
import {
    DOODLE_JUMP_ENEMY_TYPES,
    isDoodleJumpFlyingEnemy,
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
    type DoodleJumpSimulationPresentationView,
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
import { createDoodleJumpRoundSeed } from './DoodleJumpRandom';
import { referenceEnemyOffset, referenceEnemyVisualSize, referenceItemVisual } from './DoodleJumpReferenceRules';

const { ccclass } = _decorator;
const RUN_PROGRESS_SAVE_INTERVAL_SECONDS = 10;
const RESUME_COUNTDOWN_SECONDS = 3;
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
    enemy: new Color(217, 109, 120, 255),
    white: new Color(255, 255, 255, 255),
    enemyHurt: new Color(255, 178, 171, 255),
    ufoPaused: new Color(255, 183, 196, 255),
    propellerBack: new Color(220, 226, 230, 255),
    decor: new Color(255, 255, 255, 128),
    itemTrack: new Color(235, 228, 204, 224),
    rulesIcon: new Color(255, 210, 168, 255),
});

const WHITE_ALPHA_COLORS = Array.from(
    { length: 256 },
    (_unused, alpha) => new Color(255, 255, 255, alpha),
);

const TEXTURE_PATHS = Object.freeze({
    backgroundWarm: 'visual/backgrounds/parallax-v2/base-warm-tile/texture',
    backgroundSky: 'visual/backgrounds/parallax-v2/base-sky-tile/texture',
    backgroundCloud: 'visual/backgrounds/parallax-v2/base-cloud-tile/texture',
    backgroundStar: 'visual/backgrounds/parallax-v2/base-star-tile/texture',
    transitionWarmSky: 'visual/backgrounds/parallax-v2/transition-warm-sky/texture',
    transitionSkyCloud: 'visual/backgrounds/parallax-v2/transition-sky-cloud/texture',
    transitionCloudStar: 'visual/backgrounds/parallax-v2/transition-cloud-star/texture',
    decorWarmWildflowers: 'visual/backgrounds/decor-v2/warm-wildflowers/texture',
    decorWarmGrass: 'visual/backgrounds/decor-v2/warm-grass/texture',
    decorWarmClover: 'visual/backgrounds/decor-v2/warm-clover/texture',
    decorWarmLeafSprig: 'visual/backgrounds/decor-v2/warm-leaf-sprig/texture',
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
    playerJumping: 'visual/player/rabbit-jumping/texture',
    playerFalling: 'visual/player/rabbit-falling/texture',
    playerPropellerRabbit: 'visual/player/rabbit-propeller/texture',
    playerPropellerRabbitSpin: 'visual/player/rabbit-propeller-spin/texture',
    playerRocketRabbit: 'visual/player/rabbit-rocket/texture',
    playerJetpackRabbit: 'visual/player/rabbit-jetpack/texture',
    playerShoesJumping: 'visual/player/rabbit-shoes-jumping/texture',
    playerShoesFalling: 'visual/player/rabbit-shoes-falling/texture',
    goldenCarrot: 'visual/collectibles/golden-carrot/texture',
    goldenCarrotGlow: 'visual/collectibles/golden-carrot-glow/texture',
    playerJetpack: 'visual/player/player-jetpack/texture',
    playerRocket: 'visual/player/player-rocket/texture',
    shieldOverlay: 'visual/player/shield-overlay/texture',
    itemSpring: 'visual/items/pickup-spring-v2/texture',
    itemTrampoline: 'visual/items/pickup-trampoline/texture',
    itemJetpack: 'visual/items/pickup-jetpack/texture',
    itemPropellerHat: 'visual/items/pickup-propeller-hat-v2/texture',
    itemRocket: 'visual/items/pickup-rocket/texture',
    itemShield: 'visual/items/pickup-shield/texture',
    itemPickupSparkles: 'visual/effects/item-pickup-sparkles/texture',
    playerFallDrag: 'visual/effects/player-fall-drag-streaks/texture',
    playerScreenWrap: 'visual/effects/player-screen-wrap-afterimages/texture',
    jetpackFlames: 'visual/effects/jetpack-flames/texture',
    rocketFlame: 'visual/effects/rocket-flame/texture',
    flightPaperScraps: 'visual/effects/rocket-paper-scraps/texture',
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
    carrotProjectile: 'visual/projectiles/carrot-bullet/texture',
        aimReticle: 'visual/projectiles/aim-reticle-trimmed/texture',
    enemySmall01: 'visual/enemies/enemy-small-01/texture',
    enemySmall02: 'visual/enemies/enemy-small-02/texture',
    enemyLarge01: 'visual/enemies/enemy-large-01/texture',
    enemyLarge02: 'visual/enemies/enemy-large-02/texture',
    enemyHover01: 'visual/enemies/enemy-hover-01/texture',
    enemyHover02: 'visual/enemies/enemy-hover-02/texture',
    enemyHopper01: 'visual/enemies/enemy-hopper-01/texture',
    enemyHopper02: 'visual/enemies/enemy-hopper-02/texture',
    enemyWeaver01: 'visual/enemies/enemy-weaver-01/texture',
    enemyWeaver02: 'visual/enemies/enemy-weaver-02/texture',
    enemyFlyer01: 'visual/enemies/enemy-flyer-01/texture',
    enemyFlyer02: 'visual/enemies/enemy-flyer-02/texture',
    enemyBouncer01: 'visual/enemies/enemy-bouncer-01/texture',
    enemyBouncer02: 'visual/enemies/enemy-bouncer-02/texture',
    enemyRunner01: 'visual/enemies/enemy-runner-01/texture',
    enemyRunner02: 'visual/enemies/enemy-runner-02/texture',
    enemyTall01: 'visual/enemies/enemy-tall-01/texture',
    enemyTall02: 'visual/enemies/enemy-tall-02/texture',
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
    hudCarrotCard: 'visual/ui/hud/carrot-card/texture',
    hudHeightCard: 'visual/ui/hud/height-card/texture',
    hudPauseButton: 'visual/ui/hud/pause-button/texture',
    hudRulesButton: 'visual/ui/hud/rules-button/texture',
    hudItemProgressFill: 'visual/ui/hud/item-progress-fill/texture',
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
    panelMissingResource: 'visual/ui/panels/missing-resource-panel/texture',
    tutorialSensorTilt: 'visual/ui/tutorial/sensor-tilt/texture',
    tutorialCarrot: 'visual/projectiles/carrot-bullet/texture',
    tutorialHazards: 'visual/ui/tutorial/hazard-symbols/texture',
    itemIconSpring: 'visual/ui/item-icons/spring/texture',
    itemIconTrampoline: 'visual/ui/item-icons/trampoline/texture',
    itemIconJetpack: 'visual/ui/item-icons/jetpack/texture',
    itemIconPropellerHat: 'visual/items/pickup-propeller-hat-v2/texture',
    itemIconRocket: 'visual/ui/item-icons/rocket/texture',
    itemIconShield: 'visual/ui/item-icons/shield/texture',
    itemIconHeadStart: 'visual/ui/item-icons/head-start/texture',
});
const DOODLE_JUMP_REWARDED_VIDEO_ICON_PATH =
    'visual/ui/doodle-jump-rewarded-video-icon-v1/texture';
const DOODLE_JUMP_REWARDED_VIDEO_ICON_ASPECT = 120 / 85;
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
    'panelMissingResource',
]);

const REQUIRED_FORMAL_TEXTURES: readonly TextureKey[] = Object.freeze(
    Object.keys(TEXTURE_PATHS) as TextureKey[],
);

interface DoodleJumpProjectile {
    readonly id: number;
    readonly node: Node;
    x: number;
    y: number;
}

interface DoodleJumpCombatVisual {
    readonly node: Node;
    readonly visual: DoodleJumpDynamicVisualRecord;
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
    readonly fillSprite: Sprite;
}

interface DoodleJumpSpriteVisualRecord {
    readonly node: Node;
    readonly transform: UITransform;
    readonly sprite: Sprite;
    opacity?: UIOpacity;
}

interface DoodleJumpGoldenCarrotVisual {
    readonly carrot: Node;
    readonly glow: Node;
    readonly glowOpacity: UIOpacity;
    variant: number;
}

interface DoodleJumpDynamicVisualRecord {
    readonly node: Node;
    readonly transform: UITransform;
    readonly fallbackGraphics?: Graphics;
    directSprite?: Sprite | null;
    opacity?: UIOpacity | null;
    spriteVisual?: DoodleJumpSpriteVisualRecord;
    readonly children: Record<string, DoodleJumpDynamicVisualRecord | undefined>;
    width: number;
    height: number;
    platformAppearance?: DoodleJumpPlatformAppearance;
}

interface DoodleJumpItemVisualRecord extends DoodleJumpDynamicVisualRecord {
    readonly itemVisual: DoodleJumpDynamicVisualRecord;
    readonly sparkle: DoodleJumpSpriteVisualRecord;
}

interface DoodleJumpPlatformAppearance {
    type: string;
    warningProgress: number;
    isStarterFloor: boolean;
    width: number;
    height: number;
}

interface DoodleJumpDecorPlacement {
    seedIndex: number;
    parallaxY: number;
    viewportWidth: number;
    sessionId: string | undefined;
    x: number;
}

interface DoodleJumpVisualSlotState {
    readonly slotByEntityId: Map<string, number>;
    readonly entityIdBySlot: Array<string | undefined>;
    readonly seenEpochBySlot: number[];
    readonly freeSlots: number[];
}

function createDoodleJumpVisualSlotState(): DoodleJumpVisualSlotState {
    return {
        slotByEntityId: new Map<string, number>(),
        entityIdBySlot: [],
        seenEpochBySlot: [],
        freeSlots: [],
    };
}

const LANDING_DEBRIS_DURATION = 0.42;
const TRAMPOLINE_ROTATION_TURNS = 1;
const PLAYER_CONTACT_IMPACT_DURATION = 0.38;
export interface DoodleJumpServices {
    readonly platform: Platform;
    readonly assets: AssetService;
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
        carrotCount: number;
    }>;
    private failureSnapshot?: ReturnType<DoodleJumpSimulation['getSnapshot']>;
    private sensorDegraded = false;
    private sensitivity: 0.75 | 1 | 1.25 = 1;
    private roundIndex = 0;
    private sensorInvert = false;
    private saveBaseline?: DoodleJumpSaveState;
    private runHistoryBaseline?: DoodleJumpRunHistoryBaseline;
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
    private readonly backgroundDecorPlacements: DoodleJumpDecorPlacement[] = [];
    private backgroundDecorParallaxYs: number[] = [];
    private nextBackgroundDecorSeedIndex = 0;
    private worldRoot?: Node;
    private platformLayer?: Node;
    private entityLayer?: Node;
    private projectileLayer?: Node;
    private worldEffectLayer?: Node;
    private playerLayer?: Node;
    private reticleLayer?: Node;
    private uiRoot?: Node;
    private overlayRoot?: Node;
    private flowOverlayRoot?: Node;
    private pauseOverlayRoot?: Node;
    private playerNode?: Node;
    private playerMotionEffectNode?: Node;
    private playerWrapEffectNode?: Node;
    private playerPowerSecondaryEffectNode?: Node;
    private shieldPulseNode?: Node;
    private playerContactEffectNode?: Node;
    private playerContactEffectRemaining = 0;
    private landingDebrisRoot?: Node;
    private landingDebrisVisuals: Node[] = [];
    private landingDebrisVisualRecords: DoodleJumpDynamicVisualRecord[] = [];
    private platformNodes: Node[] = [];
    private platformVisualRecords: DoodleJumpDynamicVisualRecord[] = [];
    private platformNodeTypes: string[] = [];
    private enemyNodes: Node[] = [];
    private enemyVisualRecords: DoodleJumpDynamicVisualRecord[] = [];
    private enemyNodeTypes: string[] = [];
    private hazardNodes: Node[] = [];
    private hazardVisualRecords: DoodleJumpDynamicVisualRecord[] = [];
    private hazardNodeTypes: string[] = [];
    private itemNodes: Node[] = [];
    private itemVisualRecords: DoodleJumpItemVisualRecord[] = [];
    private itemNodeTypes: string[] = [];
    private shieldOverlayNode?: Node;
    private playerPowerEffectNode?: Node;
    private carrotLabel?: Label;
    private carrotCardNode?: Node;
    private carrotHudIcon?: Node;
    private carrotFlightLayer?: Node;
    private carrotWorldLayer?: Node;
    private readonly carrotNodes = new Map<string, Node>();
    private readonly carrotNodePool: Node[] = [];
    private readonly carrotVisuals = new Map<Node, DoodleJumpGoldenCarrotVisual>();
    private readonly seenCarrotIds = new Set<string>();
    private readonly carrotFlights: Array<{
        node: Node; fromX: number; fromY: number; cameraBottomY: number; elapsed: number;
        launchX?: number; launchY?: number;
    }> = [];
    private carrotHudPulseRemaining = 0;
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
    private pauseButton?: Node;
    private rulesButton?: Node;
    private aimReticleNode?: Node;
    private attackPointerId?: number;
    private aimX = 0;
    private aimY = 1;
    private activeProjectiles: DoodleJumpProjectile[] = [];
    private projectilePool: Node[] = [];
    private combatVisuals: DoodleJumpCombatVisual[] = [];
    private combatVisualPool: Node[] = [];
    private shotBatchCount = 0;
    private shotBatchStartedAt = 0;
    private lastReportedCarrotCount = -1;
    private lastReportedHeightMeters = -1;
    private activePauseModel?: MiniGamePauseModel;
    private resumeCountdownRemaining = 0;
    private resumeCountdownLabel?: Label;
    private activeResultModel?: MiniGameResultModel;
    private textureFrames: Partial<Record<TextureKey, SpriteFrame>> = {};
    private ownedFrames: SpriteFrame[] = [];
    private readonly slicedFrames = new Set<SpriteFrame>();
    private audioBank?: BundleAudioBank;
    private missingRequiredVisuals: TextureKey[] = [];
    private tutorialActive = false;
    private tutorialStep = 0;
    private tutorialOpenedFromHud = false;
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
    private webPointerListenersBound = false;
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
    private visibleSize = new Size(0, 0);
    private readonly itemHudIconKeys: Array<TextureKey | undefined> = [undefined, undefined, undefined];
    private readonly itemHudRatios = [0, 0, 0];
    private readonly itemHudTimed = [false, false, false];
    private readonly dynamicVisualRecords = new Map<Node, DoodleJumpDynamicVisualRecord>();
    private visualSlotEpoch = 0;
    private readonly platformSlots = createDoodleJumpVisualSlotState();
    private readonly itemSlots = createDoodleJumpVisualSlotState();
    private readonly enemySlots = createDoodleJumpVisualSlotState();
    private readonly hazardSlots = createDoodleJumpVisualSlotState();

    async initialize(context: MiniGameContext<DoodleJumpServices>): Promise<void> {
        if (this.stateMachine.state !== 'Loading') {
            throw new Error(`Cannot initialize DoodleJumpGame from ${this.stateMachine.state}.`);
        }
        const initializeStartedAt = Date.now();
        this.assertSceneContract();
        this.context = context;
        const gameplayAsset = await this.loadJsonAsset('configs/gameplay');
        this.config = parseDoodleJumpGameplayConfig(gameplayAsset.json);
        this.debugHeadStartRemaining = this.config.items.debugHeadStartCount;
        const saved = readDoodleJumpSave(context.services.storage);
        this.saveBaseline = saved;
        this.runHistoryBaseline = this.historyBaselineState(saved);
        this.sensitivity = saved.sensorSensitivity;
        this.sensorInvert = saved.sensorInvert;
        const activeRound = saved.activeRound;
        this.simulation = new DoodleJumpSimulation(
            this.config,
            activeRound?.snapshot.seed ?? this.nextRoundSeed(),
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
                // TODO: console.warn('[DoodleJumpGame] Ignored unrestorable active round.', error);
                const sanitized = Object.freeze({ ...saved, activeRound: undefined });
                this.saveBaseline = sanitized;
                this.runHistoryBaseline = this.historyBaselineState(sanitized);
                writeDoodleJumpSave(context.services.storage, sanitized, true);
                this.simulation = new DoodleJumpSimulation(this.config, this.nextRoundSeed());
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
        this.simulation.prepareWorld(this.visibleSize.height);
        this.prewarmPresentationPools();
        this.renderSimulation();
        this.setGameplayPresentationVisible(true);
        this.audioBank = new BundleAudioBank({
            bundle: DOODLE_JUMP_RESOURCE_BUNDLE,
            optionalMusic: 'audio/doodle-jump-paper-loop',
            cues: {},
            optionalCues: {
                uiButton: 'audio/ui-paper-button',
                fold: 'audio/paper-plane-shot',
                // 每次弹跳都会落地，三个变体轮换避免重复疲劳。
                drop: ['audio/platform-land-1', 'audio/platform-land-2', 'audio/platform-land-3'],
                collision: 'audio/impact',
                chain: 'audio/monster-defeat',
                milestone: 'audio/item-pickup',
                danger: 'audio/hazard-warning',
                failure: 'audio/run-failure',
                continue: 'audio/resurrection',
                record: 'audio/new-record',
            },
        }, context.services.audio, context.services.feedback, context.services.assets);
        await this.audioBank.initialize();
        if (this.missingRequiredVisuals.length === 0) this.destroyOverlay();
        context.services.analytics.track('doodle_jump_enter', {
            sessionId: context.sessionId,
            loadMs: Math.max(0, Date.now() - initializeStartedAt),
            bundleVersion: '0.1.0',
        });
        this.updatePresentationState('资源就绪');
    }

    begin(): void {
        if (this.stateMachine.state !== 'Loading') {
            throw new Error(`Cannot begin DoodleJumpGame from ${this.stateMachine.state}.`);
        }
        this.sessionStartedAt = this.activeRoundRestored
            ? Date.now()
                - Math.max(0, this.simulation?.getPresentationView().elapsedSeconds ?? 0) * 1000
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

    pause(): boolean {
        if (this.stateMachine.state !== 'Playing'
            && this.stateMachine.state !== 'ResumeCountdown') return false;
        this.persistCurrentRunHistory(false, true);
        this.clearResumeCountdown();
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        this.stateMachine.transition('Paused');
        this.context?.services.audio.pauseMusic();
        this.updatePresentationState('已暂停');
        return true;
    }

    resume(): void {
        if (this.stateMachine.state !== 'Paused') return;
        this.startResumeCountdown();
    }

    private startResumeCountdown(): void {
        if (this.stateMachine.state !== 'Paused'
            && this.stateMachine.state !== 'Resurrecting'
            && !(this.stateMachine.state === 'SensorCalibrating' && this.activeRoundRestored)) return;
        this.stateMachine.transition('ResumeCountdown');
        this.resumeCountdownRemaining = RESUME_COUNTDOWN_SECONDS;
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        this.context?.services.audio.pauseMusic();
        this.showResumeCountdown();
        this.updatePresentationState('准备继续');
    }

    private updateResumeCountdown(deltaTime: number): void {
        this.resumeCountdownRemaining = Math.max(
            0,
            this.resumeCountdownRemaining - Math.max(0, deltaTime),
        );
        if (this.resumeCountdownRemaining > 0.000001) {
            this.renderResumeCountdown();
            return;
        }
        this.clearResumeCountdown();
        this.stateMachine.transition('Playing');
        this.inputController?.setEnabled(true);
        this.context?.services.audio.resumeMusic();
        this.updatePresentationState(this.inputController?.supportsPointerControl()
            ? '拖动移动 · 轻点射击' : this.sensorDegraded ? '键盘开发控制' : '继续向上');
    }

    private showResumeCountdown(): void {
        this.destroyOverlay();
        if (!this.flowOverlayRoot) return;
        if (this.overlayRoot?.isValid) this.overlayRoot.active = true;
        const visible = this.visibleSize;
        const safe = calculateVerticalSafeBounds(
            visible.height,
            this.context?.services.platform.getLayoutInfo(),
            18,
        );
        const backdrop = this.createGraphicsNode(
            this.flowOverlayRoot,
            'ResumeCountdownBackdrop',
            visible.width,
            visible.height,
        );
        const backdropGraphics = backdrop.getComponent(Graphics)!;
        backdropGraphics.fillColor = new Color(30, 35, 37, 96);
        backdropGraphics.rect(-visible.width / 2, -visible.height / 2, visible.width, visible.height);
        backdropGraphics.fill();

        const countdown = this.createGraphicsNode(
            this.flowOverlayRoot,
            'ResumeCountdown',
            320,
            320,
        );
        countdown.setPosition(0, (safe.topY + safe.bottomY) / 2, 0);
        const scale = Math.min(
            1,
            Math.max(1, visible.width - 64) / 320,
            Math.max(1, safe.topY - safe.bottomY - 32) / 320,
        );
        countdown.setScale(scale, scale, 1);
        const graphics = countdown.getComponent(Graphics)!;
        graphics.fillColor = COLORS.paper;
        graphics.strokeColor = COLORS.ink;
        graphics.lineWidth = 5;
        graphics.circle(0, 20, 116);
        graphics.fill();
        graphics.stroke();
        this.resumeCountdownLabel = this.createLabel(
            countdown, 'CountdownNumber', '', 0, 20, 148, COLORS.tealDark, 220, 220,
        );
        this.createLabel(
            countdown, 'CountdownCaption', '准备继续', 0, -126, 30, COLORS.paper, 300, 48,
        );
        this.renderResumeCountdown();
    }

    private renderResumeCountdown(): void {
        const label = this.resumeCountdownLabel;
        if (!label?.isValid) return;
        const number = Math.max(1, Math.ceil(this.resumeCountdownRemaining));
        this.setLabelText(label, String(number));
        const elapsed = number - this.resumeCountdownRemaining;
        const scale = this.visualQualityProfile().uiMotion
            ? 1 + 0.14 * Math.max(0, 1 - elapsed / 0.22)
            : 1;
        label.node.setScale(scale, scale, 1);
    }

    private clearResumeCountdown(): void {
        if (this.resumeCountdownRemaining > 0 || this.resumeCountdownLabel) this.destroyOverlay();
        this.resumeCountdownRemaining = 0;
        this.resumeCountdownLabel = undefined;
    }

    async restart(context?: MiniGameContext<DoodleJumpServices>): Promise<void> {
        if (this.stateMachine.state === 'Disposed') return;
        this.clearResumeCountdown();
        this.cancelAttack(true);
        this.persistCurrentRunHistory(false, true, undefined, undefined, false);
        this.trackExitOnce('restart');
        this.lifecycleGeneration += 1;
        this.unscheduleAllCallbacks();
        this.context = context ?? this.context;
        // 从暂停菜单重开前运行层已调用 pause() 暂停音乐；新一局要解除游戏暂停，否则整局无声。
        this.context?.services.audio.resumeMusic();
        if (this.context) {
            const saved = readDoodleJumpSave(this.context.services.storage);
            this.saveBaseline = saved;
            this.runHistoryBaseline = this.historyBaselineState(saved);
            this.sensitivity = saved.sensorSensitivity;
            this.sensorInvert = saved.sensorInvert;
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
        this.backgroundDecorPlacements.length = 0;
        this.backgroundDecorParallaxYs = [];
        this.nextBackgroundDecorSeedIndex = 0;
        this.resetPlayerFailureVisual();
        this.observedLandingCount = 0;
        this.landingDebrisRemaining = 0;
        this.itemEffectRemaining = 0;
        this.tutorialActive = false;
        this.tutorialStep = 0;
        this.tutorialOpenedFromHud = false;
        this.headStartPromptActive = false;
        this.sensorCalibrationVisible = false;
        this.missingResourceActive = false;
        this.lastErrorMessage = '';
        this.debugHeadStartRemaining = this.config?.items.debugHeadStartCount ?? 0;
        this.clearCombatVisuals(false);
        this.lastReportedCarrotCount = -1;
        this.lastReportedHeightMeters = -1;
        this.clearCarrotVisuals();
        this.activePauseModel = undefined;
        this.activeResultModel = undefined;
        this.destroyOverlay();
        this.destroyPauseOverlay();
        this.resetShootingRuntime(false);
        if (this.config && this.context) {
            this.simulation = new DoodleJumpSimulation(this.config, this.nextRoundSeed());
        }
        this.simulation?.prepareWorld(this.visibleSize.height);
        this.renderSimulation();
        this.sessionStartedAt = Date.now();
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        if (this.stateMachine.state !== 'Loading') this.stateMachine.reset();
        this.begin();
        await Promise.resolve();
    }

    private nextRoundSeed(): number {
        if (!this.config || !this.context) throw new Error('Cannot seed a round before initialization.');
        const previousSeed = this.simulation?.getPresentationView().seed;
        let seed: number;
        do {
            seed = createDoodleJumpRoundSeed(this.context.sessionId, this.roundIndex++, this.config.generation.seedOverride);
        } while (this.config.generation.seedOverride === 0 && seed === previousSeed);
        return seed;
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
                // TODO: console.error('[DoodleJumpGame] Storage flush failed on dispose.', error);
            }
        } else {
            this.persistCurrentRunHistory(false, true);
        }
        this.trackExitOnce('dispose');
        this.lifecycleGeneration += 1;
        this.clearResumeCountdown();
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
            this.context?.services.assets.releaseRuntimeAsset(frame);
        });
        this.ownedFrames = [];
        this.rewardedVideoIconFrame?.destroy();
        this.rewardedVideoIconFrame = undefined;
        this.slicedFrames.clear();
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
        if (this.tutorialOpenedFromHud) {
            this.tutorialActive = false;
            this.tutorialOpenedFromHud = false;
            this.tutorialStep = 0;
            this.destroyOverlay();
        }
    }

    showResultView(model: MiniGameResultModel): void {
        this.activeResultModel = model;
        if (this.stateMachine.state === 'Failing') this.stateMachine.transition('Result');
        this.inputController?.setEnabled(false);
        this.cancelAttack(true);
        this.destroyOverlay();
        const carrotCount = Math.max(0, Math.floor(model.result.score));
        const maxHeightMeters = Math.max(0, Math.floor(
            typeof model.result.extra?.maxHeightMeters === 'number'
                ? model.result.extra.maxHeightMeters
                : 0,
        ));
        const isNewBestCarrotCount = model.result.extra?.isNewBestCarrotCount === true;
        const overlay = this.createOverlay(
            'ResultOverlay',
            '本局结束',
            '',
            'panelResults',
            'flow',
            true,
            620,
            64,
        );
        const bestHeightMeters = Math.max(maxHeightMeters, this.saveBaseline?.bestHeightMeters ?? 0);
        const previousBestHeight = this.runHistoryBaseline?.bestHeightMeters
            ?? this.saveBaseline?.bestHeightMeters ?? 0;
        const bestCarrotCount = Math.max(carrotCount, this.saveBaseline?.bestCarrotCount ?? 0);
        this.createRoundSummary(
            overlay, carrotCount, maxHeightMeters, 60,
            isNewBestCarrotCount, maxHeightMeters > previousBestHeight,
            { bestHeightMeters, bestCarrotCount },
        );
        this.createButton(overlay, '再来一局', 0, -140, 360, 82, () => {
            void model.restart();
        }, 'primary', 'hudPlayAgainButton');
        this.createButton(overlay, '返回大厅', 0, -230, 360, 72, () => {
            this.trackExitOnce('result-lobby');
            void model.returnToLobby();
        }, 'secondary', 'hudBackButton');
    }

    hideResultView(): void {
        this.activeResultModel = undefined;
        this.destroyOverlay();
    }

    update(deltaTime: number): void {
        if (this.stateMachine.state === 'ResumeCountdown') {
            this.updateResumeCountdown(deltaTime);
            return;
        }
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
            this.simulation.getPresentedPlayerX(),
        ) ?? 0;
        const visible = this.visibleSize;
        this.updateShootingInput();
        this.simulation.advance(deltaTime, horizontal, visible.height);
        const presentation = this.simulation.getPresentationView();
        const shots = this.simulation.drainShotsFired();
        if (shots > 0) {
            if (this.shotBatchCount === 0) this.shotBatchStartedAt = Date.now();
            this.shotBatchCount += shots; this.runShotCount += shots;
            this.context?.services.feedback.play('fold', { vibrate: false });
        }
        this.flushShotBatchIfDue(false);
        this.captureLandingEffect(presentation);
        this.consumeCombatEvents(this.simulation.drainCombatEvents(), presentation);
        this.consumeHazardEvents(this.simulation.drainHazardEvents());
        this.consumeItemEvents(this.simulation.drainItemEvents());
        this.consumeCollectibleEvents(this.simulation.drainCollectibleEvents(), presentation);
        this.updateCarrotFlights(deltaTime, presentation);
        this.renderSimulation(presentation);
        this.runProgressSaveElapsed += Math.max(0, deltaTime);
        if (this.runProgressSaveElapsed >= RUN_PROGRESS_SAVE_INTERVAL_SECONDS) {
            // Crash-recovery checkpoint. Each checkpoint is rebuilt from the
            // immutable run baseline, so repeated writes replace one another
            // instead of double-counting. Serializing the round and the
            // synchronous platform storage write cost frames on device, so the
            // interval stays long; lifecycle boundaries (pause, hide, failure,
            // revive, restart and dispose) still persist immediately.
            this.runProgressSaveElapsed = 0;
            this.persistCurrentRunHistory(false, false);
        }
        if (this.context?.services.platform.supportsAccelerometer()
            && this.inputController?.hasStaleSensor()) {
            this.enterSensorError("未检测到手机倾斜数据");
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
        if (this.activeRoundRestored) {
            this.startPlaying();
        } else if (this.simulation?.getPresentationView().itemStatus.usedHeadStart) {
            this.startPlaying();
        } else if (this.availableHeadStartCount() > 0) {
            this.showHeadStartPrompt();
        } else {
            this.startPlaying();
        }
    }

    private showTutorialStep(animatePanel = true): void {
        const validState = this.stateMachine.state === 'SensorCalibrating'
            || (this.tutorialOpenedFromHud && this.stateMachine.state === 'Paused');
        if (!validState || !this.tutorialActive) return;
        const webControl = this.inputController?.supportsPointerControl() === true;
        const steps = [
            Object.freeze({
                title: webControl ? '第 1 步 · 拖动移动' : '第 1 步 · 倾斜移动',
                message: webControl ? '横向拖动屏幕控制小兔子\n也可使用方向键或 A / D' : '左右倾斜手机控制小兔子\n沿途碰到金萝卜即可收集',
                texture: 'playerJumping' as TextureKey,
            }),
            Object.freeze({
                title: '第 2 步 · 发射胡萝卜',
                message: webControl ? '轻点发射一根胡萝卜\n按空格可持续发射' : '点击发射一根胡萝卜\n按住会持续发射',
                texture: 'tutorialCarrot' as TextureKey,
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
            'flow',
            animatePanel,
        );
        const frame = this.textureFrames[step.texture];
        if (frame) {
            const height = step.texture === 'playerJumping' ? 156 : step.texture === 'tutorialCarrot' ? 96 : 176;
            this.createSpriteNode(overlay, 'TutorialIllustration', frame,
                height * frame.originalSize.width / frame.originalSize.height, height, 0, 18);
        }
        this.createButton(
            overlay,
            this.tutorialStep >= steps.length - 1
                ? (this.tutorialOpenedFromHud ? '继续游戏' : '开始游戏')
                : '下一步',
            80,
            -205,
            250,
            76,
            () => {
                if (this.tutorialStep < steps.length - 1) {
                    this.tutorialStep += 1;
                    this.showTutorialStep(false);
                } else {
                    this.completeTutorial();
                }
            },
        );
        this.createButton(overlay, "知道了", -155, -205, 150, 70, () => {
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
                // TODO: console.error('[DoodleJumpGame] Failed to persist tutorial completion.', error);
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
                // TODO: console.error('[DoodleJumpGame] Failed to consume Head Start.', error);
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
        this.runStarted = true;
        this.runProgressSaveElapsed = 0;
        const snapshot = this.simulation?.getPresentationView();
        this.context?.services.analytics.track('doodle_jump_run_start', {
            sessionId: this.context.sessionId,
            seed: snapshot?.seed ?? 0,
            sensorInvert: this.sensorInvert,
            usedHeadStart: snapshot?.itemStatus.usedHeadStart ?? false,
            resumed: this.activeRoundRestored,
        });
        // 新局直接开始；恢复旧局必须在校准和引导结束后走统一的倒计时，
        // 不能先进入 Playing 再补暂停，否则可能提前推进玩法或绕过倒计时。
        if (this.activeRoundRestored) {
            this.startResumeCountdown();
            return;
        }
        this.stateMachine.transition('Playing');
        this.inputController?.setEnabled(true);
        this.updatePresentationState(this.inputController?.supportsPointerControl()
            ? '拖动移动 · 轻点射击' : this.sensorDegraded ? '键盘开发控制' : '左右倾斜控制移动');
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
        const carrotCount = snapshot?.collectibleState.collectedCount ?? 0;
        // 失败快照是跨生命周期边界的关键状态：先在仍可构建 activeRound 的
        // Playing 状态同步写盘，再切换到 Failing，避免死亡后立即退出时只剩
        // 上一次 10 秒检查点。
        this.persistCurrentRunHistory(false, true, undefined, snapshot);
        this.runProgressSaveElapsed = 0;
        this.stateMachine.transition('Failing');
        this.context?.services.feedback.play('failure');
        this.updatePresentationState(this.failureReasonText(reason));
        this.context?.services.analytics.track('doodle_jump_fail', {
            sessionId: this.context.sessionId,
            failureReason: reason,
            carrotCount,
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
        this.pendingFailure = Object.freeze({ reason, carrotCount });
        if (reason === 'monster-contact') this.startPlayerContactEffect();
        this.beginFailureDrop(reason, snapshot);
    }

    private beginFailureDrop(
        reason: DoodleJumpFailureReason,
        snapshot: ReturnType<DoodleJumpSimulation['getSnapshot']> | undefined,
    ): void {
        if (!this.config) return;
        this.failureDropActive = true;
        this.failureDropElapsed = 0;
        this.failureAnimationReason = reason;
        // The drop continues from what was on screen: the interpolated render
        // position, not the fixed-step state that may be up to one step ahead.
        const presented = this.simulation?.getPresentationView();
        this.failureDropWorldX = presented?.playerX ?? this.config.design.width / 2;
        this.failureDropWorldY = presented?.playerY ?? 0;
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
            if (focusIndex >= 0) {
                const focusHazardId = snapshot.hazards[focusIndex].id;
                const slot = this.hazardSlots.slotByEntityId.get(focusHazardId);
                this.failureFocusHazardNode = slot === undefined
                    ? undefined
                    : this.hazardNodes[slot];
            }
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
        const visible = this.visibleSize;
        const cameraBottomY = this.simulation.getPresentationView().cameraBottomY;
        const cameraCenterY = cameraBottomY + visible.height / 2;
        const playerOpacity = this.playerNode?.isValid
            ? this.ensureVisualOpacity(this.playerNode)
            : undefined;
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
            this.setOpacity(playerOpacity, Math.max(0, Math.round(255 * (1 - progress))));
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
                this.setOpacity(playerOpacity, Math.max(0, Math.round(255 * (1 - fadeProgress))));
            }
            animationFinished = progress >= 1;
        } else {
            const trapHold = this.failureAnimationReason === 'bear-trap' ? 0.24 : 0;
            if (this.failureDropElapsed > trapHold) {
                this.failureDropVelocityY += this.config.player.gravity * safeDelta;
                this.failureDropWorldY += this.failureDropVelocityY * safeDelta;
            }
            this.setOpacity(playerOpacity, 255);
        }
        this.playerNode?.setPosition(
            this.failureDropWorldX - this.config.design.width / 2,
            this.failureDropWorldY - cameraCenterY,
            0,
        );
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
        this.failureFocusHazardNode = undefined;
        if (this.failureHazardEffectNode?.isValid) this.failureHazardEffectNode.active = false;
        const failure = this.pendingFailure;
        if (!failure) return;
        const reviveEnabled = this.context?.services.ads.isEnabledForGame(
            this.context.gameId,
        ) === true;
        const maximumRevives = this.config?.resurrection.maximumSuccessfulRevives ?? 0;
        if (!reviveEnabled || this.successfulRevives >= maximumRevives) {
            this.commitResult(failure.reason, failure.carrotCount);
            return;
        }
        this.showResurrectionPrompt();
    }

    private showResurrectionPrompt(message?: string): void {
        if (this.settlementCommitted
            || (this.stateMachine.state !== 'Failing'
                && this.stateMachine.state !== 'ResurrectPrompt')) return;
        if (this.stateMachine.state === 'Failing') this.stateMachine.transition('ResurrectPrompt');
        this.reviveActionLocked = false;
        this.destroyOverlay();
        const heightMeters = this.calculateHeightMeters(
            this.failureSnapshot?.maxAbsoluteWorldY ?? 0,
        );
        const carrotCount = this.pendingFailure?.carrotCount ?? 0;
        const overlay = this.createOverlay(
            'ResurrectionOverlay',
            '还能继续向上',
            '',
            'panelRevive',
            'flow',
            true,
            620,
            64,
        );
        this.createRoundSummary(overlay, carrotCount, heightMeters, 60);
        if (message) {
            const adStatus = this.createLabel(
                overlay, 'AdStatus', message,
                0, -78, 18, COLORS.coral, 432, 28,
            );
            adStatus.overflow = Label.Overflow.SHRINK;
        }
        this.createButton(
            overlay,
            '看广告复活',
            0,
            -140,
            360,
            82,
            () => {
                void this.requestResurrection();
            },
            'primary',
            undefined,
            true,
        );
        this.createButton(overlay, '放弃', 0, -230, 360, 72, () => {
            const failure = this.pendingFailure;
            if (failure) this.commitResult(failure.reason, failure.carrotCount);
        }, 'secondary');
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
                result.outcome === 'skipped' ? '广告未完整观看，可以重试' : undefined,
            );
            return;
        }
        if (this.stateMachine.state !== 'ResurrectPrompt') return;
        this.stateMachine.transition('Resurrecting');
        this.destroyOverlay();
        this.resetShootingRuntime(false);
        const failureReason = this.pendingFailure?.reason ?? 'fall';
        const failureHeightMeters = this.calculateHeightMeters(
            this.failureSnapshot?.maxAbsoluteWorldY ?? 0,
        );
        const resurrection = this.simulation?.resurrect(this.visibleSize.height);
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
        this.startResumeCountdown();
        this.runProgressSaveElapsed = 0;
        const revived = this.simulation?.getSnapshot();
        // 复活会重置位置、速度、附近危险物和护盾，必须把这个新局面立即
        // 固化，不能等下一次 10 秒检查点。
        this.persistCurrentRunHistory(false, true, undefined, revived);
        this.context.services.feedback.play('continue');
        if (revived) this.startItemEffect(
            'resurrectionPulse',
            revived.playerX,
            revived.playerY,
            0.62,
        );
        this.updatePresentationState('复活成功，准备继续');
    }

    private commitResult(reason: DoodleJumpFailureReason, carrotCount: number): void {
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
        const isNewBestCarrotCount = this.persistCurrentRunHistory(
            true,
            true,
            carrotCount,
            snapshot,
        );
        if (isNewBestCarrotCount) this.context?.services.feedback.play('record');
        this.context?.services.analytics.track('doodle_jump_result', {
            sessionId: this.context.sessionId,
            carrotCount,
            heightMeters: maxHeightMeters,
            killCount,
        });
        const result: GameResult = Object.freeze({
            // Framework numeric result is the collected count, with no distance/kill score.
            score: carrotCount,
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
                hopperMonsterKills: snapshot?.combat.hopperMonsterKills ?? 0,
                weaverMonsterKills: snapshot?.combat.weaverMonsterKills ?? 0,
                flyerMonsterKills: snapshot?.combat.flyerMonsterKills ?? 0,
                bouncerMonsterKills: snapshot?.combat.bouncerMonsterKills ?? 0,
                runnerMonsterKills: snapshot?.combat.runnerMonsterKills ?? 0,
                tallMonsterKills: snapshot?.combat.tallMonsterKills ?? 0,
                stompCount: snapshot?.combat.stompCount ?? 0,
                ufoInterruptCount: snapshot?.hazardStats.ufoInterruptCount ?? 0,
                platformLandCount: snapshot?.landingCount ?? 0,
                itemPickupCount: snapshot?.itemStatus.itemPickupCount ?? 0,
                usedHeadStart: snapshot?.itemStatus.usedHeadStart ?? false,
                usedResurrect: this.successfulRevives > 0,
                runDurationMs,
                isNewBestCarrotCount,
            }),
        });
        this.context?.requestExit(result);
    }

    private calculateHeightMeters(maxAbsoluteWorldY: number): number {
        const startWorldY = (this.config?.fixedPlatforms[0].y ?? 42)
            + (this.config?.player.collisionHeight ?? 68) / 2;
        return Math.max(0, Math.floor((maxAbsoluteWorldY - startWorldY) / 100));
    }

    private persistCurrentRunHistory(
        completed: boolean,
        flush: boolean,
        carrotCountOverride?: number,
        snapshotOverride?: ReturnType<DoodleJumpSimulation['getSnapshot']>,
        preserveActiveRound = !completed,
    ): boolean {
        const context = this.context;
        const save = this.saveBaseline;
        const runBaseline = this.runHistoryBaseline;
        if (!context || !save || !runBaseline || !this.runStarted || (!completed && this.settlementCommitted)) {
            if (flush && context) {
                try {
                    context.services.storage.flush();
                } catch (error: unknown) {
                    // TODO: console.error('[DoodleJumpGame] Storage flush failed.', error);
                }
            }
            return false;
        }
        // 统计从本局开始前的固定基线重建，避免重复计数；引导和道具数量等
        // 设置使用最新值，避免被开局时的快照覆盖。
        const baseline = Object.freeze({ ...save, ...runBaseline });
        const snapshot = snapshotOverride ?? this.simulation?.getSnapshot();
        const carrotCount = carrotCountOverride ?? snapshot?.collectibleState.collectedCount ?? 0;
        const canResumeCurrentState = this.stateMachine.state === 'Playing'
            || this.stateMachine.state === 'Paused'
            || this.stateMachine.state === 'ResumeCountdown';
        const activeRound = !completed
            && preserveActiveRound
            && canResumeCurrentState
            && snapshot
            ? this.buildActiveRound(snapshot, runBaseline)
            : undefined;
        const history = buildDoodleJumpRunSave(baseline, Object.freeze({
            shots: this.runShotCount,
            kills: snapshot?.combat.killCount ?? 0,
            carrots: carrotCount,
            maxHeightMeters: this.calculateHeightMeters(snapshot?.maxAbsoluteWorldY ?? 0),
            completed,
            playedAt: Date.now(),
            activeRound,
        }));
        try {
            writeDoodleJumpSave(context.services.storage, history.save, flush);
        } catch (error: unknown) {
            // TODO: console.error('[DoodleJumpGame] Failed to persist run history.', error);
            return false;
        }
        return history.isNewBestCarrotCount;
    }

    private buildActiveRound(
        snapshot: ReturnType<DoodleJumpSimulation['getSnapshot']>,
        baseline: DoodleJumpRunHistoryBaseline,
    ): DoodleJumpActiveRound {
        const historyBaseline: DoodleJumpRunHistoryBaseline = Object.freeze({
            playCount: baseline.playCount,
            bestCarrotCount: baseline.bestCarrotCount,
            lastPlayedAt: baseline.lastPlayedAt,
            bestHeightMeters: baseline.bestHeightMeters,
            bestKillCount: baseline.bestKillCount,
            totalShots: baseline.totalShots,
            totalKills: baseline.totalKills,
            totalCarrots: baseline.totalCarrots,
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

    private historyBaselineState(save: DoodleJumpSaveState): DoodleJumpRunHistoryBaseline {
        return save.activeRound?.historyBaseline ?? Object.freeze({
            playCount: save.playCount,
            bestCarrotCount: save.bestCarrotCount,
            lastPlayedAt: save.lastPlayedAt,
            bestHeightMeters: save.bestHeightMeters,
            bestKillCount: save.bestKillCount,
            totalShots: save.totalShots,
            totalKills: save.totalKills,
            totalCarrots: save.totalCarrots,
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
            `${message}\n请竖直握住手机，检查重力感应权限后重试`,
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
        this.applyLoadingRabbitArtwork();
    }

    private applyLoadingRabbitArtwork(): void {
        const panel = this.flowOverlayRoot?.getChildByName('LoadingOverlay');
        if (!panel || panel.getChildByName('LoadingRabbitArtwork')) return;
        const rabbit = this.textureFrames.playerJumping;
        if (!rabbit || !this.textureFrames.goldenCarrot || !this.textureFrames.goldenCarrotGlow) return;
        const artwork = new Node('LoadingRabbitArtwork');
        artwork.layer = panel.layer;
        artwork.setParent(panel);
        this.createSpriteNode(artwork, 'Rabbit', rabbit,
            155 * rabbit.originalSize.width / rabbit.originalSize.height, 155, -62, -10);
        const carrot = this.createGoldenCarrotVisual(artwork, 'LoadingGoldenCarrot');
        carrot.setPosition(68, 5, 0);
    }

    private showSensorCalibrationOverlay(): void {
        if (this.stateMachine.state !== 'SensorCalibrating') return;
        this.sensorCalibrationVisible = true;
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'SensorCalibrationOverlay',
            '校准重力感应',
            "请竖直握住手机，保持不动片刻",
            'panelSensorCalibration',
        );
        const frame = this.textureFrames.tutorialSensorTilt;
        if (frame) this.createSpriteNode(overlay, 'CalibrationGuide', frame, 210, 150, 0, -35);
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
        this.lastErrorMessage = names.length > 0 ? `部分游戏资源未加载：${names}` : "游戏资源暂时不可用";
        this.updatePresentationState('资源缺失');
        this.destroyOverlay();
        const overlay = this.createOverlay(
            'MissingResourceOverlay',
            "游戏资源加载失败",
            `${this.lastErrorMessage}\n请重新加载，或返回大厅`,
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
        this.refreshVisibleSize();
        const visible = this.visibleSize;
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
        this.bindWebPointerListeners();
        this.renderSimulation();
    }

    private createWorldNodes(): void {
        if (!this.worldRoot || !this.config) return;
        this.platformLayer = this.createWorldLayer('PlatformLayer');
        this.entityLayer = this.createWorldLayer('EntityLayer');
        const carrots = new Node('GoldenCarrotLayer');
        carrots.layer = this.node.layer;
        carrots.setParent(this.entityLayer);
        this.carrotWorldLayer = carrots;
        this.projectileLayer = this.createWorldLayer('ProjectileLayer');
        this.worldEffectLayer = this.createWorldLayer('WorldEffectLayer');
        this.playerLayer = this.createWorldLayer('PlayerLayer');
        this.reticleLayer = this.createWorldLayer('ReticleLayer');
        this.platformNodeTypes = [];
        this.platformVisualRecords = [];
        this.platformNodes = this.config.fixedPlatforms.map((platform) => {
            const node = this.createGraphicsNode(
                this.platformLayer!,
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
            this.platformVisualRecords.push(this.registerDynamicVisual(node));
            return node;
        });
        const player = this.createGraphicsNode(this.playerLayer, 'Player', 72, 92);
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

        const reticle = this.createGraphicsNode(this.reticleLayer, 'AimReticle', 58, 58);
        const reticleGraphics = reticle.getComponent(Graphics)!;
        reticleGraphics.strokeColor = COLORS.teal;
        reticleGraphics.lineWidth = 4;
        reticleGraphics.circle(0, 0, 18);
        reticleGraphics.stroke();
        reticle.active = false;
        this.aimReticleNode = reticle;
    }

    private createWorldLayer(name: string): Node {
        const layer = new Node(name);
        layer.layer = this.node.layer;
        layer.setParent(this.worldRoot!);
        layer.addComponent(UITransform).setContentSize(
            this.visibleSize.width,
            this.visibleSize.height,
        );
        return layer;
    }

    private createHud(): void {
        if (!this.uiRoot || !this.context) return;
        const visible = this.visibleSize;
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
        this.carrotCardNode = createCard(
            'CarrotCard',
            'hudCarrotCard',
            185,
            122,
            -visible.width / 2 + 103,
            safe.topY - 65,
        );
        this.carrotLabel = this.createLabel(
            this.carrotCardNode,
            'CarrotCount',
            '0',
            31,
            -6,
            24,
            COLORS.paper,
            114,
            38,
        );
        this.applyCarrotHudIcon();
        this.carrotFlightLayer = new Node('GoldenCarrotFlights');
        this.carrotFlightLayer.layer = this.node.layer;
        this.carrotFlightLayer.setParent(this.uiRoot);
        this.carrotFlightLayer.addComponent(UITransform).setContentSize(visible.width, visible.height);
        this.heightCardNode = createCard(
            'HeightCard',
            'hudHeightCard',
            205,
            111,
            -visible.width / 2 + 306,
            safe.topY - 65,
        );
        this.heightLabel = this.createLabel(
            this.heightCardNode,
            'Height',
            '0000m',
            34,
            -8,
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
            () => this.openTutorialFromHud(),
            'secondary',
            'hudRulesButton',
        );
        this.rulesButton.name = 'Button-Rules';
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
        graphics.fillColor = COLORS.itemTrack;
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
        this.setSpriteFrame(fillSprite, this.textureFrames.hudItemProgressFill ?? null);
        return { root, icon, track, fill, fillSprite };
    }

    private renderSimulation(
        presentation?: DoodleJumpSimulationPresentationView,
    ): void {
        const snapshot = presentation ?? this.simulation?.getPresentationView();
        const visible = this.visibleSize;
        if (!snapshot || !this.config) return;
        this.visualSlotEpoch += 1;
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
        this.updatePlayerVisual(snapshot.velocityX, snapshot.itemStatus, snapshot.velocityY, snapshot.elapsedSeconds);
        this.updatePlayerItemVisuals(
            snapshot.itemStatus,
            snapshot.elapsedSeconds,
            snapshot.velocityY,
        );
        this.renderLandingEffect(cameraCenterY, centerX);
        this.renderItemEffect(cameraCenterY, centerX);
        this.renderFlightPowerDrop(cameraCenterY, centerX, snapshot.cameraBottomY);
        this.updateParallaxBackground(snapshot.cameraBottomY, visible);
        this.renderCollectibles(snapshot, centerX, cameraCenterY);
        snapshot.platforms.forEach((platform) => {
            const slot = this.reserveVisualSlot(platform.id, this.platformSlots);
            this.ensurePlatformNodes(slot + 1);
            const node = this.platformNodes[slot];
            const visual = this.platformVisualRecords[slot];
            if (!node?.isValid || !visual) return;
            const platformVisualHeight = this.config.platformBehavior.visualHeight;
            const renderVisible = !platform.consumed && !platform.spawnPlan?.entityOnly
                && !(platform.type === 'teleport' && platform.warningProgress >= 1) && this.isVerticalVisualVisible(
                platform.y - 76,
                platform.y + 86,
                snapshot.cameraBottomY,
                110,
                220,
            );
            this.setNodeActive(node, renderVisible);
            if (!renderVisible) return;
            node.setPosition(
                platform.x - centerX,
                platform.y - platformVisualHeight / 2 - cameraCenterY,
                0,
            );
            this.setVisualSize(visual, platform.width, platformVisualHeight);
            this.applyPlatformVisual(
                node,
                slot,
                platform.type,
                platform.warningProgress,
                platform.id === 'P0',
                snapshot.elapsedSeconds,
            );
        });
        this.releaseUnseenVisualSlots(this.platformSlots, this.platformNodes);
        snapshot.items.forEach((item) => {
            const slot = this.reserveVisualSlot(item.id, this.itemSlots);
            this.ensureItemNodes(slot + 1);
            const node = this.itemNodes[slot];
            if (!node?.isValid) return;
            const renderVisible = this.isVerticalVisualVisible(
                item.y - 70,
                item.y + 70,
                snapshot.cameraBottomY,
                100,
                160,
            );
            this.setNodeActive(node, renderVisible);
            if (!renderVisible) return;
            node.setPosition(
                item.x - centerX,
                item.y - cameraCenterY,
                0,
            );
            this.applyItemVisual(node, slot, item, snapshot.elapsedSeconds);
        });
        this.releaseUnseenVisualSlots(this.itemSlots, this.itemNodes);
        snapshot.enemies.forEach((enemy) => {
            const slot = this.reserveVisualSlot(enemy.id, this.enemySlots);
            this.ensureEnemyNodes(slot + 1);
            const node = this.enemyNodes[slot];
            if (!node?.isValid) return;
            const [, nativeHeight] = referenceEnemyVisualSize(enemy.type);
            const [, offsetY] = referenceEnemyOffset(enemy.type);
            const scale = this.config!.design.width / 320;
            const visualCenterY = enemy.y - offsetY * scale;
            const renderVisible = this.isVerticalVisualVisible(
                visualCenterY - nativeHeight * scale / 2,
                visualCenterY + nativeHeight * scale / 2,
                snapshot.cameraBottomY,
                100,
                180,
            );
            this.setNodeActive(node, renderVisible);
            if (!renderVisible) return;
            node.setPosition(enemy.x - centerX, enemy.y - cameraCenterY, 0);
            this.applyEnemyVisual(node, slot, enemy, snapshot.elapsedSeconds);
        });
        this.releaseUnseenVisualSlots(this.enemySlots, this.enemyNodes);
        snapshot.hazards.forEach((hazard) => {
            const slot = this.reserveVisualSlot(hazard.id, this.hazardSlots);
            this.ensureHazardNodes(slot + 1);
            const node = this.hazardNodes[slot];
            if (!node?.isValid) return;
            const blackHoleRadius = hazard.type === 'black-hole'
                ? this.config!.hazards.blackHole.outerRadius
                : 0;
            const ufoBeamLength = hazard.type === 'ufo'
                ? this.config!.hazards.ufo.beamLength
                : 0;
            const renderVisible = this.isVerticalVisualVisible(
                hazard.y - Math.max(hazard.height / 2, blackHoleRadius, ufoBeamLength),
                hazard.y + Math.max(hazard.height / 2, blackHoleRadius),
                snapshot.cameraBottomY,
                140,
                260,
            );
            this.setNodeActive(node, renderVisible);
            if (!renderVisible) return;
            node.setPosition(hazard.x - centerX, hazard.y - cameraCenterY, 0);
            this.applyHazardVisual(node, slot, hazard, snapshot.elapsedSeconds);
        });
        this.releaseUnseenVisualSlots(this.hazardSlots, this.hazardNodes);
        this.renderCombatVisuals(centerX, cameraCenterY);
        this.syncProjectileVisuals(snapshot);
        this.activeProjectiles.forEach((projectile) => {
            projectile.node.setPosition(
                projectile.x - centerX,
                projectile.y - cameraCenterY,
                0,
            );
        });
        const meters = this.calculateHeightMeters(snapshot.maxAbsoluteWorldY);
        if (snapshot.collectedCarrotCount !== this.lastReportedCarrotCount) {
            this.lastReportedCarrotCount = snapshot.collectedCarrotCount;
            this.context?.reportScore(snapshot.collectedCarrotCount);
        }
        if (meters !== this.lastReportedHeightMeters) {
            this.lastReportedHeightMeters = meters;
            this.context?.reportAchievementProgress('height-meters', meters);
        }
        const meterText = meters.toString();
        this.setLabelText(this.heightLabel, `${meterText.length >= 4 ? meterText : '0000'.slice(meterText.length) + meterText}m`);
        // A pickup is already durable in simulation; the HUD adds it after its flight arrives.
        const arrived = Math.max(0, snapshot.collectedCarrotCount - this.carrotFlights.length);
        this.setLabelText(this.carrotLabel, `${arrived}`);
        this.updateItemHud(snapshot.itemStatus, snapshot.velocityY);
    }

    private renderCollectibles(snapshot: DoodleJumpSimulationPresentationView, centerX: number, cameraCenterY: number): void {
        const frame = this.textureFrames.goldenCarrot;
        if (!frame || !this.carrotWorldLayer) return;
        const seen = this.seenCarrotIds;
        seen.clear();
        for (const carrot of snapshot.collectibles) {
            if (!this.isVerticalVisualVisible(carrot.y - 68, carrot.y + 68, snapshot.cameraBottomY, 80, 120)) continue;
            seen.add(carrot.id);
            let node = this.carrotNodes.get(carrot.id);
            if (!node) {
                node = this.carrotNodePool.pop() ?? this.createGoldenCarrotVisual(this.carrotWorldLayer, 'GoldenCarrot');
                node.setParent(this.carrotWorldLayer);
                node.setScale(1, 1, 1);
                node.setRotationFromEuler(0, 0, 0);
                this.carrotNodes.set(carrot.id, node);
            }
            this.setNodeActive(node, true);
            const phase = snapshot.elapsedSeconds * 3.2 + carrot.variant * 0.7;
            const bob = Math.sin(phase);
            node.setPosition(carrot.x - centerX, carrot.y - cameraCenterY + bob * 3, 0);
            const visual = this.carrotVisuals.get(node)!;
            if (visual.variant !== carrot.variant) {
                visual.carrot.setRotationFromEuler(0, 0, (carrot.variant - 3.5) * 2);
                visual.variant = carrot.variant;
            }
            const glowScale = 1 + bob * 0.065;
            visual.glow.setScale(glowScale, glowScale, 1);
            this.setOpacity(visual.glowOpacity, Math.round(215 + bob * 25));
        }
        this.carrotNodes.forEach((node, id) => {
            if (seen.has(id)) return;
            node.active = false;
            this.carrotNodes.delete(id);
            this.carrotNodePool.push(node);
        });
    }

    private createGoldenCarrotVisual(parent: Node, name: string): Node {
        const frame = this.textureFrames.goldenCarrot!;
        const root = new Node(name);
        root.layer = parent.layer;
        root.setParent(parent);
        root.addComponent(UITransform).setContentSize(144, 144);
        // Static halo geometry is baked into the same atlas as the carrot.
        // Consecutive pickups now share one sprite batch instead of alternating Graphics/Sprite draws.
        const glow = this.createSpriteNode(root, 'Glow', this.textureFrames.goldenCarrotGlow!, 144, 144);
        const glowOpacity = glow.addComponent(UIOpacity);
        glowOpacity.opacity = 230;
        const carrot = this.createSpriteNode(root, 'Carrot', frame,
            70 * frame.originalSize.width / frame.originalSize.height, 70);
        this.carrotVisuals.set(root, { carrot, glow, glowOpacity, variant: -1 });
        return root;
    }

    private consumeCollectibleEvents(events: readonly DoodleJumpCollectibleEvent[],
        presentation: DoodleJumpSimulationPresentationView): void {
        const frame = this.textureFrames.goldenCarrot;
        if (!frame || !this.carrotFlightLayer) return;
        for (const pickup of events) {
            // Continue the world pickup's own visual; fall back to the shared pool for culled pickups.
            const node = this.carrotNodes.get(pickup.id) ?? this.carrotNodePool.pop()
                ?? this.createGoldenCarrotVisual(this.carrotFlightLayer, 'GoldenCarrotFlight');
            this.carrotNodes.delete(pickup.id);
            node.setParent(this.carrotFlightLayer);
            node.setScale(1, 1, 1);
            node.setRotationFromEuler(0, 0, 0);
            this.setNodeActive(node, true);
            const fromX = pickup.x - (this.config?.design.width ?? 750) / 2;
            const fromY = pickup.y - presentation.cameraBottomY - this.visibleSize.height / 2;
            node.setPosition(fromX, fromY, 0);
            this.carrotFlights.push({ node, fromX, fromY, cameraBottomY: presentation.cameraBottomY, elapsed: 0 });
        }
    }

    private updateCarrotFlights(deltaSeconds: number, presentation: DoodleJumpSimulationPresentationView): void {
        const card = this.carrotCardNode;
        if (!card) return;
        if (this.carrotFlights.length === 0) {
            this.updateCarrotHudPulse(deltaSeconds);
            return;
        }
        const gatherSeconds = this.config?.collectibles.gatherSeconds ?? 0.22;
        const holdSeconds = this.config?.collectibles.headHoldSeconds ?? 0.08;
        const duration = this.config?.collectibles.flightSeconds ?? 0.44;
        const launchAt = gatherSeconds + holdSeconds;
        const targetX = card.position.x + (this.carrotHudIcon?.position.x ?? -48);
        const targetY = card.position.y + (this.carrotHudIcon?.position.y ?? -10);
        const safeTop = this.context ? calculateVerticalSafeBounds(
            this.visibleSize.height, this.context.services.platform.getLayoutInfo(), 18,
        ).topY : this.visibleSize.height / 2;
        const rabbitLayout = this.rabbitVisualLayout(presentation.itemStatus);
        const headX = presentation.playerX - (this.config?.design.width ?? 750) / 2 + this.playerFacing * 9;
        const headY = Math.min(safeTop - 80, presentation.playerY - presentation.cameraBottomY
            - this.visibleSize.height / 2 + rabbitLayout.headY);
        for (let index = this.carrotFlights.length - 1; index >= 0; index -= 1) {
            const flight = this.carrotFlights[index];
            flight.elapsed += Math.max(0, deltaSeconds);
            if (flight.elapsed < launchAt) {
                const progress = Math.min(1, flight.elapsed / gatherSeconds);
                const t = 1 - Math.pow(1 - progress, 3);
                const wrap = this.config?.player.wrapDistance ?? 750;
                let fromX = flight.fromX;
                if (Math.abs(headX - fromX) > wrap / 2) fromX += headX > fromX ? wrap : -wrap;
                const fromY = flight.fromY + flight.cameraBottomY - presentation.cameraBottomY;
                flight.node.setPosition(fromX + (headX - fromX) * t,
                    fromY + (headY - fromY) * t + Math.sin(progress * Math.PI) * 28, 0);
                const size = 0.9 + Math.sin(progress * Math.PI / 2) * 0.18;
                flight.node.setScale(size, size, 1);
                flight.node.setRotationFromEuler(0, 0, 12 * Math.sin(progress * Math.PI));
                continue;
            }
            // Freeze the actual head position at departure. This leg lives in HUD space,
            // so jumping/camera scrolling cannot drag it away from the counter.
            if (flight.launchX === undefined || flight.launchY === undefined) {
                flight.launchX = headX;
                flight.launchY = headY;
            }
            const progress = Math.min(1, (flight.elapsed - launchAt) / duration);
            const t = progress * progress * (3 - 2 * progress);
            const oneMinusT = 1 - t;
            const controlX = flight.launchX + (targetX - flight.launchX) * 0.3 + 64;
            const controlY = Math.min(Math.max(flight.launchY, targetY) + 96, safeTop - 80);
            flight.node.setPosition(
                oneMinusT * oneMinusT * flight.launchX + 2 * oneMinusT * t * controlX + t * t * targetX,
                oneMinusT * oneMinusT * flight.launchY + 2 * oneMinusT * t * controlY + t * t * targetY, 0,
            );
            const size = 1.08 - t * 0.48;
            flight.node.setScale(size, size, 1);
            flight.node.setRotationFromEuler(0, 0, -18 * Math.sin(progress * Math.PI));
            if (progress >= 1) {
                flight.node.active = false;
                flight.node.setParent(this.carrotWorldLayer ?? null);
                this.carrotNodePool.push(flight.node);
                this.carrotFlights.splice(index, 1);
                this.carrotHudPulseRemaining = 0.18;
                this.context?.services.feedback.play('drop', { vibrate: false });
            }
        }
        this.updateCarrotHudPulse(deltaSeconds);
    }

    private updateCarrotHudPulse(deltaSeconds: number): void {
        if (this.carrotHudPulseRemaining <= 0) return;
        this.carrotHudPulseRemaining = Math.max(0, this.carrotHudPulseRemaining - Math.max(0, deltaSeconds));
        const pulse = 1 + 0.14 * Math.sin(this.carrotHudPulseRemaining / 0.18 * Math.PI);
        this.carrotHudIcon?.setScale(pulse, pulse, 1);
    }

    private clearCarrotVisuals(): void {
        this.carrotFlights.forEach(flight => { if (flight.node.isValid) flight.node.destroy(); });
        this.carrotFlights.length = 0;
        this.carrotNodes.forEach(node => { if (node.isValid) node.destroy(); });
        this.carrotNodes.clear();
        this.carrotNodePool.forEach(node => { if (node.isValid) node.destroy(); });
        this.carrotNodePool.length = 0;
        this.carrotVisuals.clear();
        this.seenCarrotIds.clear();
        this.carrotHudPulseRemaining = 0;
        this.carrotHudIcon?.setScale(1, 1, 1);
    }

    private ensurePlatformNodes(count: number): void {
        if (!this.platformLayer || !this.config) return;
        while (this.platformNodes.length < count) {
            const index = this.platformNodes.length;
            const platform = this.createGraphicsNode(
                this.platformLayer,
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
            this.platformVisualRecords.push(this.registerDynamicVisual(platform));
            this.platformNodeTypes.push('');
        }
    }

    private ensureEnemyNodes(count: number): void {
        if (!this.entityLayer) return;
        while (this.enemyNodes.length < count) {
            const index = this.enemyNodes.length;
            const enemy = this.createGraphicsNode(
                this.entityLayer,
                `Enemy-runtime-${index}`,
                76,
                70,
            );
            const graphics = enemy.getComponent(Graphics)!;
            graphics.fillColor = COLORS.enemy;
            graphics.strokeColor = COLORS.ink;
            graphics.lineWidth = 3;
            graphics.roundRect(-27, -25, 54, 50, 14);
            graphics.fill();
            graphics.stroke();
            this.enemyNodes.push(enemy);
            this.enemyVisualRecords.push(this.registerDynamicVisual(enemy));
            this.enemyNodeTypes.push('');
        }
    }

    private ensureItemNodes(count: number): void {
        if (!this.entityLayer) return;
        while (this.itemNodes.length < count) {
            const index = this.itemNodes.length;
            const item = new Node(`Item-runtime-${index}`);
            item.layer = this.node.layer;
            item.setParent(this.entityLayer);
            const itemTransform = item.addComponent(UITransform);
            itemTransform.setContentSize(112, 112);

            const sparkle = new Node('PickupSparkle');
            sparkle.layer = this.node.layer;
            sparkle.setParent(item);
            const sparkleTransform = sparkle.addComponent(UITransform);
            sparkleTransform.setContentSize(104, 81);
            const sparkleSprite = sparkle.addComponent(Sprite);
            this.setSpriteFrame(sparkleSprite, this.textureFrames.itemPickupSparkles ?? null);

            const visual = new Node('ItemVisual');
            visual.layer = this.node.layer;
            visual.setParent(item);
            const visualTransform = visual.addComponent(UITransform);
            visualTransform.setContentSize(68, 68);
            const itemRecord = this.registerDynamicVisual(item, itemTransform);
            const visualRecord = this.registerDynamicVisual(visual, visualTransform);
            this.itemNodes.push(item);
            this.itemVisualRecords.push(Object.assign(itemRecord, {
                itemVisual: visualRecord,
                sparkle: {
                    node: sparkle,
                    transform: sparkleTransform,
                    sprite: sparkleSprite,
                },
            }) as DoodleJumpItemVisualRecord);
            this.itemNodeTypes.push('');
        }
    }

    private applyItemVisual(
        node: Node,
        index: number,
        item: DoodleJumpItemSnapshot,
        elapsedSeconds: number,
    ): void {
        const key = item.type === 'spring' || item.type === 'spring-shoes' ? 'itemSpring'
            : item.type === 'trampoline' ? 'itemTrampoline'
                : item.type === 'jetpack' ? 'itemJetpack'
                    : item.type === 'propeller-hat' ? 'itemPropellerHat'
                        : item.type === 'rocket' ? 'itemRocket'
                            : 'itemShield';
        const frame = this.textureFrames[key as TextureKey];
        if (!frame) return;
        const record = this.itemVisualRecords[index];
        const visual = record?.itemVisual.node;
        if (!record || !visual?.isValid) return;
        let shoes = node.getChildByName('SpringShoesVisual');
        if (!shoes && item.type === 'spring-shoes') {
            shoes = this.createSpringShoesVisual(node, 'SpringShoesVisual');
        }
        const scale = this.config!.design.width / 320;
        const [nativeWidth, nativeHeight, offsetX, offsetY] = referenceItemVisual(item.type);
        if (shoes) {
            this.setNodeActive(shoes, item.type === 'spring-shoes');
            shoes.setScale(nativeWidth * scale / 72, nativeHeight * scale / 54, 1);
            shoes.setPosition(offsetX * scale, offsetY * scale, 0);
        }
        this.setNodeActive(visual, item.type !== 'spring-shoes');
        const width = nativeWidth * scale;
        const height = nativeHeight * scale;
        this.setVisualSize(record.itemVisual, width, height);
        if (this.itemNodeTypes[index] !== item.type) {
            this.applySpriteVisual(visual, frame);
            this.itemNodeTypes[index] = item.type;
        }
        this.syncSpriteVisualSize(visual);
        const compressionScale = item.type === 'trampoline' && (item.compressionFrames ?? 0) > 0
            ? 0.6 + (item.compressionFrames ?? 0) * 0.075 : 1;
        visual.setScale(1, compressionScale, 1);
        visual.setPosition(offsetX * scale, offsetY * scale - height * (1 - compressionScale) / 2, 0);

        const sparkle = record.sparkle.node;
        const sparkleSprite = record.sparkle.sprite;
        if (sparkle.isValid) {
            const phase = elapsedSeconds * 2.15 + item.phase * Math.PI * 2;
            const pulse = (Math.sin(phase) + 1) / 2;
            const sparkleWidth = item.type === 'trampoline' ? 118 : 100;
            const sparkleFrame = sparkleSprite.spriteFrame;
            const sparkleHeight = sparkleWidth
                * Math.max(1, sparkleFrame?.originalSize.height ?? 1)
                / Math.max(1, sparkleFrame?.originalSize.width ?? 1);
            this.setVisualSize(record.sparkle, sparkleWidth, sparkleHeight);
            const pulseScale = 0.9 + pulse * 0.12;
            sparkle.setScale(pulseScale, pulseScale, 1);
            sparkle.setPosition(offsetX * scale, offsetY * scale + 3 + pulse * 2, 0);
            sparkle.setRotationFromEuler(0, 0, Math.sin(phase * 0.55) * 5);
            this.setSpriteColor(sparkleSprite, this.whiteAlpha(145 + pulse * 80));
        }
    }

    private applyEnemyVisual(
        node: Node,
        index: number,
        enemy: DoodleJumpEnemySnapshot,
        elapsedSeconds: number,
    ): void {
        const frameIndex = Math.floor((elapsedSeconds + enemy.animationPhase) * 6) % 2;
        const record = this.enemyVisualRecords[index];
        if (!record) return;
        // Each native species owns its paper-garden frames. Reusing a flying
        // silhouette and multiplying its color obscures walking/bouncing roles.
        const species = enemy.type.charAt(0).toUpperCase() + enemy.type.slice(1);
        const key = `enemy${species}${frameIndex === 0 ? '01' : '02'}` as TextureKey;
        const scale = this.config!.design.width / 320;
        const [nativeWidth, nativeHeight] = referenceEnemyVisualSize(enemy.type);
        const [offsetX, offsetY] = referenceEnemyOffset(enemy.type);
        const visualWidth = nativeWidth * scale;
        const visualHeight = nativeHeight * scale;
        this.setVisualSize(record, visualWidth, visualHeight);
        if (this.enemyNodeTypes[index] !== key) {
            const frame = this.textureFrames[key as TextureKey];
            if (frame) this.applySpriteVisual(node, frame);
            this.enemyNodeTypes[index] = key;
        }
        this.syncSpriteVisualSize(node);
        const sprite = this.getSpriteVisual(node);
        if (sprite) {
            this.setSpriteColor(sprite, enemy.hurt ? COLORS.enemyHurt : COLORS.white);
            sprite.node.setPosition(
                -offsetX * scale,
                -offsetY * scale,
                0,
            );
        }
    }

    private ensureHazardNodes(count: number): void {
        if (!this.entityLayer) return;
        while (this.hazardNodes.length < count) {
            const index = this.hazardNodes.length;
            const hazard = new Node(`Hazard-runtime-${index}`);
            hazard.layer = this.node.layer;
            hazard.setParent(this.entityLayer);
            const transform = hazard.addComponent(UITransform);
            transform.setContentSize(120, 120);
            this.hazardNodes.push(hazard);
            this.hazardVisualRecords.push(this.registerDynamicVisual(hazard, transform));
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
        const record = this.hazardVisualRecords[index];
        if (!record) return;
        const setChild = (
            name: string,
            frame: SpriteFrame | undefined,
            width: number,
            height: number,
            x: number,
            y: number,
        ): Node | undefined => {
            if (!frame) return undefined;
            let childRecord = record.children[name];
            if (!childRecord) {
                const child = new Node(name);
                child.layer = node.layer;
                child.setParent(node);
                const transform = child.addComponent(UITransform);
                const opacity = child.addComponent(UIOpacity);
                childRecord = this.registerDynamicVisual(child, transform);
                childRecord.opacity = opacity;
                record.children[name] = childRecord;
            }
            const child = childRecord.node;
            this.setNodeActive(child, true);
            this.setVisualSize(childRecord, width, height);
            child.setPosition(x, y, 0);
            this.applySpriteVisual(child, frame);
            return child;
        };
        const hideChild = (name: string): void => {
            const child = record.children[name]?.node;
            if (child) this.setNodeActive(child, false);
        };
        ['UfoBeam', 'UfoLock', 'UfoTether', 'BlackHoleCore', 'TrapFlash'].forEach(hideChild);
        node.setRotationFromEuler(0, 0, 0);
        node.setScale(1, 1, 1);
        const existingBodyOpacity = record.spriteVisual?.opacity;
        if (existingBodyOpacity) existingBodyOpacity.opacity = 255;

        if (hazard.type === 'ufo') {
            this.setVisualSize(record, hazard.width + 18, hazard.height + 30);
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
                const opacity = record.children.UfoBeam?.opacity;
                this.setOpacity(opacity, Math.round(
                    48 + hazard.lockProgress * 90 + hazard.abductionProgress * 70,
                ));
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
                this.setNodeActive(
                    lock,
                    hazard.lockProgress > 0 && hazard.abductionProgress <= 0,
                );
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
                this.setNodeActive(tether, hazard.abductionProgress > 0);
                const opacity = record.children.UfoTether?.opacity;
                this.setOpacity(opacity, Math.round(110 + hazard.abductionProgress * 145));
            }
            if (this.textureFrames.ufo) this.applySpriteVisual(node, this.textureFrames.ufo);
            const body = this.getSpriteVisual(node);
            if (body) {
                this.setSpriteColor(body, hazard.paused ? COLORS.ufoPaused : COLORS.white);
                body.node.setPosition(0, 0, 0);
                body.node.setRotationFromEuler(0, 0, Math.sin(elapsedSeconds * 3 + hazard.phase * 6) * 2);
            }
        } else if (hazard.type === 'black-hole') {
            const diameter = this.config.hazards.blackHole.outerRadius * 2;
            this.setVisualSize(record, diameter, diameter);
            if (this.textureFrames.blackHoleRing) {
                this.applySpriteVisual(node, this.textureFrames.blackHoleRing);
            }
            const ring = this.getSpriteVisual(node);
            ring?.node.setRotationFromEuler(0, 0, elapsedSeconds * 18 + hazard.phase * 360);
            let ringOpacity = record.spriteVisual?.opacity;
            if (record.spriteVisual && !ringOpacity) {
                ringOpacity = record.spriteVisual.node.addComponent(UIOpacity);
                record.spriteVisual.opacity = ringOpacity;
            }
            this.setOpacity(ringOpacity, 188);
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
            this.setVisualSize(record, 76, 42);
            if (this.textureFrames.bearTrap) {
                this.applySpriteVisual(node, this.textureFrames.bearTrap);
            }
            const body = this.getSpriteVisual(node);
            if (body) {
                // Hazard nodes are pooled. A node that previously rendered a
                // swaying UFO must not carry that child rotation into a trap.
                this.setSpriteColor(body, COLORS.white);
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
                this.setNodeActive(flash, hazard.triggered);
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
        const record = this.platformVisualRecords[index];
        if (!record) return;
        // 世界坐标每帧更新，但平台外观只依赖类型、尺寸和效果进度。
        // 池槽换型、起始地板复用、平台加宽及一次性平台动画均会失效。
        const appearance = record.platformAppearance;
        if (appearance
            && this.platformNodeTypes[index] === type
            && appearance.type === type
            && appearance.warningProgress === warningProgress
            && appearance.isStarterFloor === isStarterFloor
            && appearance.width === record.width
            && appearance.height === record.height) return;
        if (appearance) {
            appearance.type = type;
            appearance.warningProgress = warningProgress;
            appearance.isStarterFloor = isStarterFloor;
            appearance.width = record.width;
            appearance.height = record.height;
        } else {
            record.platformAppearance = {
                type, warningProgress, isStarterFloor, width: record.width, height: record.height,
            };
        }
        const fullVisual = record.spriteVisual?.node;
        const breakLeft = record.children.BreakLeftVisual?.node;
        const breakRight = record.children.BreakRightVisual?.node;
        const isBreaking = type === 'breakable' && warningProgress > 0;
        if (fullVisual) this.setNodeActive(fullVisual, !isBreaking && !isStarterFloor);
        if (breakLeft) this.setNodeActive(breakLeft, isBreaking);
        if (breakRight) this.setNodeActive(breakRight, isBreaking);
        const textureKey = type === 'moving' ? 'movingPlatform'
            : type === 'vertical-moving' ? 'verticalMovingPlatform'
                : type === 'teleport' ? 'disappearingPlatform'
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
            const starterFullVisual = record.spriteVisual?.node;
            if (starterFullVisual) this.setNodeActive(starterFullVisual, false);
            this.applyStarterFloorVisual(node);
            this.hidePlatformEffect(node);
            return;
        }
        this.hideStarterFloorVisual(node);
        const regularFullVisual = record.spriteVisual?.node;
        if (regularFullVisual) this.setNodeActive(regularFullVisual, !isBreaking);
        if (isBreaking) {
            this.applyBreakablePieces(node, warningProgress);
            this.applyPlatformEffect(node, type, warningProgress, elapsedSeconds);
            return;
        }
        const sprite = this.getSpriteVisual(node);
        if (sprite) {
            const alpha = type === 'disappearing' || type === 'teleport'
                ? Math.max(0, Math.round(255 * (1 - warningProgress)))
                : type === 'exploding' && warningProgress > 1
                    ? Math.max(0, Math.round(255 * (2 - warningProgress)))
                    : warningProgress > 0
                    ? Math.floor(warningProgress * 8) % 2 === 0 ? 255 : 110
                    : 255;
            this.setSpriteColor(sprite, type === 'teleport' ? new Color(196, 162, 235, alpha) : this.whiteAlpha(alpha));
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
        const parentRecord = this.registerDynamicVisual(node);
        const widths = [136, 164, 104, 172, 178] as const;
        let left = -375;
        widths.forEach((width, index) => {
            const name = `StarterSegment-${index}`;
            let segment = parentRecord.children[name]?.node;
            if (!segment) {
                segment = new Node(name);
                segment.layer = node.layer;
                segment.setParent(node);
                segment.addComponent(UITransform);
                const sprite = segment.addComponent(Sprite);
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                parentRecord.children[name] = this.registerDynamicVisual(segment);
            }
            this.setNodeActive(segment, true);
            const segmentRecord = parentRecord.children[name]
                ?? this.registerDynamicVisual(segment);
            parentRecord.children[name] = segmentRecord;
            this.setVisualSize(segmentRecord, width + 4, 42);
            this.setSpriteFrame(this.getDirectSprite(segment)!, frame);
            segment.setPosition(left + width / 2, 0, 0);
            left += width - 1;
        });
    }

    private hideStarterFloorVisual(node: Node): void {
        const parentRecord = this.registerDynamicVisual(node);
        for (let index = 0; index < 5; index += 1) {
            const segment = parentRecord.children[`StarterSegment-${index}`]?.node;
            if (segment) this.setNodeActive(segment, false);
        }
    }

    private applyPlatformEffect(
        node: Node,
        type: string,
        progress: number,
        _elapsedSeconds = 0,
    ): void {
        const parentRecord = this.registerDynamicVisual(node);
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
        let effect = parentRecord.children.PlatformEffectVisual?.node;
        if (!effect) {
            effect = new Node('PlatformEffectVisual');
            effect.layer = node.layer;
            effect.setParent(node);
            const transform = effect.addComponent(UITransform);
            const sprite = effect.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const opacity = effect.addComponent(UIOpacity);
            const effectRecord = this.registerDynamicVisual(effect, transform);
            effectRecord.opacity = opacity;
            parentRecord.children.PlatformEffectVisual = effectRecord;
        }
        const effectRecord = parentRecord.children.PlatformEffectVisual
            ?? this.registerDynamicVisual(effect);
        parentRecord.children.PlatformEffectVisual = effectRecord;
        this.setNodeActive(effect, true);
        this.setVisualSize(effectRecord, size, size);
        this.setSpriteFrame(this.getDirectSprite(effect)!, frame);
        effect.setPosition(0, type === 'exploding' && progress > 1 ? 15 : 6, 0);
        effect.setScale(scale, scale, 1);
        effect.setRotationFromEuler(0, 0, rotation);
        const opacity = effectRecord.opacity ?? effect.getComponent(UIOpacity) ?? undefined;
        effectRecord.opacity = opacity;
        this.setOpacity(opacity, 255);
    }

    private hidePlatformEffect(node: Node): void {
        const effect = this.dynamicVisualRecords.get(node)?.children.PlatformEffectVisual?.node;
        if (effect) this.setNodeActive(effect, false);
    }

    private applyBreakablePieces(node: Node, progress: number): void {
        const leftFrame = this.textureFrames.breakableLeft;
        const rightFrame = this.textureFrames.breakableRight;
        if (!leftFrame || !rightFrame) return;
        const parentRecord = this.registerDynamicVisual(node);
        const parentSize = parentRecord.transform.contentSize;
        const createPiece = (name: string, frame: SpriteFrame): Sprite => {
            let piece = parentRecord.children[name]?.node;
            if (!piece) {
                piece = new Node(name);
                piece.layer = node.layer;
                piece.setParent(node);
                const transform = piece.addComponent(UITransform);
                parentRecord.children[name] = this.registerDynamicVisual(piece, transform);
            }
            this.setNodeActive(piece, true);
            const pieceRecord = parentRecord.children[name]
                ?? this.registerDynamicVisual(piece);
            parentRecord.children[name] = pieceRecord;
            this.setVisualSize(pieceRecord, parentSize.width, parentSize.height);
            let sprite = this.getDirectSprite(piece);
            if (!sprite) {
                sprite = piece.addComponent(Sprite);
                pieceRecord.directSprite = sprite;
            }
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this.setSpriteFrame(sprite, frame);
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
        this.setSpriteColor(left, this.whiteAlpha(alpha));
        this.setSpriteColor(right, this.whiteAlpha(alpha));
    }

    private updateShootingInput(): void {
        const held = (!this.inputController?.supportsPointerControl()
            && (this.attackPointerId !== undefined || this.mouseAttackHeld))
            || this.inputController?.isKeyboardFireHeld() === true;
        this.simulation?.setFireHeld(held, this.aimX, this.aimY);
    }

    private syncProjectileVisuals(snapshot: DoodleJumpSimulationPresentationView): void {
        for (let index = this.activeProjectiles.length - 1; index >= 0; index -= 1) {
            if (!snapshot.projectiles.some((projectile) => projectile.id === this.activeProjectiles[index].id))
                this.recycleProjectile(index);
        }
        for (const projectile of snapshot.projectiles) {
            let visual = this.activeProjectiles.find((candidate) => candidate.id === projectile.id);
            if (!visual) {
                const node = this.obtainProjectileNode();
                node.active = true;
                node.setRotationFromEuler(0, 0, Math.atan2(projectile.velocityY, projectile.velocityX) * 180 / Math.PI);
                visual = { id: projectile.id, node, x: projectile.x, y: projectile.y };
                this.activeProjectiles.push(visual);
            }
            visual.x = projectile.x; visual.y = projectile.y;
        }
    }

    private consumeCombatEvents(
        events: readonly DoodleJumpCombatEvent[],
        presentation: DoodleJumpSimulationPresentationView,
    ): void {
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
                    hitCount: presentation.combat.hitCount,
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
        if (!this.worldEffectLayer) return;
        const root = new Node('FlightPowerDrop');
        root.layer = this.node.layer;
        root.setParent(this.worldEffectLayer);
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
    }

    private startFlightPowerDrop(
        type: DoodleJumpFlightPower,
        worldX: number,
        worldY: number,
    ): void {
        const root = this.flightPowerDropRoot;
        const body = this.flightPowerDropBodyNode;
        if (!root?.isValid || !body?.isValid) return;
        const direction = this.playerFacing >= 0 ? -1 : 1;
        this.flightPowerDropType = type;
        this.flightPowerDropElapsed = 0;
        this.flightPowerDropWorldX = worldX;
        this.flightPowerDropWorldY = worldY;
        this.flightPowerDropVelocityX = direction * (type === 'rocket' ? 185 : 150);
        this.flightPowerDropVelocityY = type === 'rocket' ? 600 : 520;
        this.flightPowerDropRotation = 0;
        this.flightPowerDropAngularVelocity = direction * (type === 'rocket' ? 250 : 390);
        this.setNodeActive(root, true);
        root.setRotationFromEuler(0, 0, 0);
        root.setScale(1, 1, 1);
        this.setNodeActive(body, true);
        if (type === 'jetpack') {
            const frame = this.textureFrames.playerJetpack;
            if (!frame) {
                root.active = false;
                return;
            }
            this.setSpriteFrame(this.getDirectSprite(body)!, frame);
            this.setVisualSize(this.registerDynamicVisual(body), 48, 46);
            body.setPosition(-33 * this.playerFacing, 5, 0);
            body.setScale(this.playerFacing, 1, 1);
        } else if (type === 'rocket') {
            const frame = this.textureFrames.playerRocket;
            if (!frame) {
                root.active = false;
                return;
            }
            this.setSpriteFrame(this.getDirectSprite(body)!, frame);
            this.setVisualSize(this.registerDynamicVisual(body), 88, 128);
            body.setPosition(18 * this.playerFacing, -34, 0);
            body.setScale(this.playerFacing, 1, 1);
        } else {
            const frame = this.textureFrames.itemPropellerHat;
            if (!frame) { root.active = false; return; }
            this.setSpriteFrame(this.getDirectSprite(body)!, frame);
            this.setVisualSize(this.registerDynamicVisual(body), 75,
                75 * frame.originalSize.height / frame.originalSize.width);
            body.setPosition(0, 82, 0);
            body.setScale(1, 1, 1);
        }
    }

    private updateFlightPowerDrop(deltaSeconds: number): void {
        const root = this.flightPowerDropRoot;
        if (!root?.isValid || !this.flightPowerDropType) return;
        const delta = Math.min(0.05, Math.max(0, deltaSeconds));
        this.flightPowerDropElapsed += delta;
        this.flightPowerDropWorldX += this.flightPowerDropVelocityX * delta;
        this.flightPowerDropVelocityY -= 920 * delta;
        this.flightPowerDropWorldY += this.flightPowerDropVelocityY * delta;
        this.flightPowerDropRotation += this.flightPowerDropAngularVelocity * delta;
        root.setRotationFromEuler(0, 0, this.flightPowerDropRotation);

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
        if (!root?.isValid || !this.flightPowerDropType) return;
        const renderVisible = this.isVerticalVisualVisible(
            this.flightPowerDropWorldY - 130,
            this.flightPowerDropWorldY + 150,
            cameraBottomY,
            120,
            180,
        );
        this.setNodeActive(root, renderVisible);
        if (!renderVisible) {
            if (this.flightPowerDropWorldY < cameraBottomY - 200) {
                this.flightPowerDropType = undefined;
            }
            return;
        }
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
        if (!this.worldEffectLayer) return;
        const effect = new Node('ItemEffect');
        effect.layer = this.node.layer;
        effect.setParent(this.worldEffectLayer);
        const transform = effect.addComponent(UITransform);
        transform.setContentSize(150, 150);
        const opacity = effect.addComponent(UIOpacity);
        opacity.opacity = 0;
        const sprite = effect.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        const record = this.registerDynamicVisual(effect, transform);
        record.opacity = opacity;
        record.directSprite = sprite;
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
        this.setNodeActive(effect, true);
        this.setSpriteFrame(this.getDirectSprite(effect)!, frame);
        const width = (key === 'trampolineRebound' ? 216
                : key === 'springRebound' ? 196
                    : 144)
            * this.visualQualityProfile().effectScale;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        this.setVisualSize(this.registerDynamicVisual(effect), width, height);
    }

    private renderItemEffect(cameraCenterY: number, centerX: number): void {
        const effect = this.itemEffectNode;
        if (!effect?.isValid || this.itemEffectRemaining <= 0) {
            if (effect?.isValid) this.setNodeActive(effect, false);
            return;
        }
        const progress = 1 - this.itemEffectRemaining / Math.max(0.001, this.itemEffectDuration);
        const cameraBottomY = cameraCenterY - this.visibleSize.height / 2;
        const renderVisible = this.isVerticalVisualVisible(
            this.itemEffectWorldY - 120,
            this.itemEffectWorldY + 150,
            cameraBottomY,
            100,
            160,
        );
        this.setNodeActive(effect, renderVisible);
        if (!renderVisible) return;
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
        const opacity = this.getVisualOpacity(effect);
        if (opacity) {
            const fadeProgress = isLandingBoost
                ? Math.max(0, (progress - 0.38) / 0.62)
                : progress;
            this.setOpacity(opacity, Math.max(0, Math.round(255 * (1 - fadeProgress))));
        }
    }

    private spawnCombatVisual(event: DoodleJumpCombatEvent): void {
        if (!this.worldEffectLayer) return;
        const kind = event.type === 'hit' ? 'hit' : 'defeat';
        const frame = kind === 'hit'
            ? this.textureFrames.enemyHitScratch
            : this.textureFrames.enemyDefeatFragments;
        if (!frame) return;
        const pooled = this.combatVisualPool.pop();
        const node = pooled?.isValid ? pooled : new Node('EnemyCombatEffect');
        node.layer = this.node.layer;
        if (!node.parent) node.setParent(this.worldEffectLayer);
        const visual = this.registerDynamicVisual(node);
        const transform = visual.transform;
        const width = (kind === 'hit' ? 66 : 132)
            * this.visualQualityProfile().effectScale;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        this.setVisualSize(visual, width, height);
        const opacity = visual.opacity
            ?? node.getComponent(UIOpacity)
            ?? node.addComponent(UIOpacity);
        visual.opacity = opacity;
        opacity.opacity = 255;
        this.applySpriteVisual(node, frame);
        node.active = true;
        const durationSeconds = kind === 'hit' ? 0.18 : 0.46;
        this.combatVisuals.push({
            node,
            visual,
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
            this.setNodeActive(visual.node, false);
            this.combatVisuals.splice(index, 1);
            this.combatVisualPool.push(visual.node);
        }
    }

    private renderCombatVisuals(centerX: number, cameraCenterY: number): void {
        const cameraBottomY = cameraCenterY - this.visibleSize.height / 2;
        this.combatVisuals.forEach((visual) => {
            const progress = 1 - visual.remainingSeconds / visual.durationSeconds;
            const renderVisible = this.isVerticalVisualVisible(
                visual.y - 90,
                visual.y + 160,
                cameraBottomY,
                100,
                180,
            );
            this.setNodeActive(visual.node, renderVisible);
            if (!renderVisible) return;
            visual.node.setPosition(
                visual.x - centerX,
                visual.y - cameraCenterY + progress * (visual.kind === 'defeat' ? 20 : 7),
                0,
            );
            const scale = visual.kind === 'defeat'
                ? 0.72 + progress * 0.5
                : 0.82 + progress * 0.18;
            visual.node.setScale(scale, scale, 1);
            const opacity = visual.visual.opacity;
            this.setOpacity(opacity, Math.max(0, Math.round(255 * (1 - progress))));
        });
    }

    private clearCombatVisuals(destroyNodes: boolean): void {
        this.combatVisuals.forEach((visual) => {
            if (!visual.node.isValid) return;
            if (destroyNodes) visual.node.destroy();
            else {
                this.resetReusableVisualNode(visual.node);
                this.combatVisualPool.push(visual.node);
            }
        });
        if (destroyNodes) {
            this.combatVisualPool.forEach((node) => {
                if (node.isValid) node.destroy();
            });
        }
        this.combatVisuals = [];
        if (destroyNodes) this.combatVisualPool = [];
    }

    private tryFireCarrot(): void {
        if (this.stateMachine.state !== 'Playing') return;
        this.simulation?.queueShot(this.aimX, this.aimY);
    }

    private obtainProjectileNode(): Node {
        const pooled = this.projectilePool.pop();
        if (pooled?.isValid) return pooled;
        const node = this.createGraphicsNode(
            this.projectileLayer!,
            'CarrotProjectile',
            54,
            34,
        );
        const graphics = node.getComponent(Graphics)!;
        graphics.fillColor = new Color(244, 139, 63, 255);
        graphics.strokeColor = COLORS.ink;
        graphics.lineWidth = 2;
        graphics.moveTo(-14, -10); graphics.lineTo(25, 0); graphics.lineTo(-14, 10);
        graphics.close(); graphics.fill(); graphics.stroke();
        graphics.fillColor = COLORS.teal;
        graphics.ellipse(-20, 0, 9, 5); graphics.fill();
        const frame = this.textureFrames.carrotProjectile;
        if (frame) {
            this.setVisualSize(this.registerDynamicVisual(node),
                54, 54 * frame.originalSize.height / frame.originalSize.width);
            this.applySpriteVisual(node, frame);
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

    private cancelAttack(flushBatch: boolean, discardQueuedShot = true): void {
        this.simulation?.clearFireInput(discardQueuedShot);
        this.attackPointerId = undefined;
        this.mouseAttackHeld = false;
        this.inputController?.endPointerDrag();
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

    private resetShootingRuntime(destroyNodes: boolean): void {
        this.simulation?.clearProjectiles();
        this.cancelAttack(true);
        this.activeProjectiles.forEach((projectile) => {
            if (!projectile.node.isValid) return;
            if (destroyNodes) projectile.node.destroy();
            else {
                this.resetReusableVisualNode(projectile.node);
                this.projectilePool.push(projectile.node);
            }
        });
        if (destroyNodes) {
            this.projectilePool.forEach((node) => {
                if (node.isValid) node.destroy();
            });
        }
        this.activeProjectiles = [];
        if (destroyNodes) this.projectilePool = [];
        this.aimX = 0;
        this.aimY = 1;
    }

    private resetReusableVisualNode(node: Node): void {
        const record = this.dynamicVisualRecords.get(node);
        if (record) record.platformAppearance = undefined;
        node.active = false;
        node.setPosition(0, 0, 0);
        node.setScale(1, 1, 1);
        node.setRotationFromEuler(0, 0, 0);
        const resetRenderState = (current: Node): void => {
            const opacity = current.getComponent(UIOpacity);
            if (opacity) opacity.opacity = 255;
            const sprite = current.getComponent(Sprite);
            if (sprite) sprite.color = COLORS.white;
            current.children.forEach(resetRenderState);
        };
        resetRenderState(node);
    }

    private updatePresentationState(message: string): void {
        this.setLabelText(this.statusLabel, message);
        const isPlaying = this.stateMachine.state === 'Playing';
        const showStatus = !isPlaying
            && this.stateMachine.state !== 'Failing'
            && !this.hasVisibleOverlay();
        if (this.titleLabel) this.setNodeActive(this.titleLabel.node, showStatus);
        if (this.statusLabel) this.setNodeActive(this.statusLabel.node, showStatus);
        if (this.pauseButton) {
            this.setNodeActive(this.pauseButton, this.stateMachine.state === 'Playing');
        }
        if (this.rulesButton) {
            this.setNodeActive(this.rulesButton, this.stateMachine.state === 'Playing');
        }
        if (this.carrotCardNode) this.setNodeActive(this.carrotCardNode, isPlaying);
        if (this.carrotFlightLayer) this.setNodeActive(this.carrotFlightLayer, isPlaying);
        if (this.heightCardNode) this.setNodeActive(this.heightCardNode, isPlaying);
        if (!isPlaying && this.itemStatusFrameNode) {
            this.setNodeActive(this.itemStatusFrameNode, false);
        }
        this.renderSimulation();
    }

    private async loadVisualAssets(): Promise<void> {
        const assets = this.context!.services.assets;
        const keys = Object.keys(TEXTURE_PATHS) as TextureKey[];
        const packedKeys = keys.filter(key => !!PACKED_SPRITE_PATHS[TEXTURE_PATHS[key]]);
        const packed = await assets.loadSpriteFrames(DOODLE_JUMP_RESOURCE_BUNDLE, packedKeys.map(key => ({
            key, path: PACKED_SPRITE_PATHS[TEXTURE_PATHS[key]],
        })));
        Object.keys(packed).forEach(key => {
            this.textureFrames[key as TextureKey] = packed[key];
            this.ownedFrames.push(packed[key]);
        });
        await Promise.all(keys.filter(key => !PACKED_SPRITE_PATHS[TEXTURE_PATHS[key]]).map(async key => {
            if (this.textureFrames[key]) return;
            try {
                const texture = await this.loadTexture(TEXTURE_PATHS[key]);
                this.textureFrames[key] = this.createRuntimeSpriteFrame(key, texture);
            } catch (error: unknown) {
                // Missing standalone art is reported by the existing formal-resource screen.
            }
        }));
        this.missingRequiredVisuals = REQUIRED_FORMAL_TEXTURES.filter(key => !this.textureFrames[key]);
    }

    private async preloadLoadingVisual(): Promise<void> {
        try {
            const texture = await this.loadTexture(TEXTURE_PATHS.panelLoading);
            this.textureFrames.panelLoading = this.createRuntimeSpriteFrame(
                'panelLoading',
                texture,
            );
        } catch (error: unknown) {
            // TODO: console.warn('[DoodleJumpGame] Formal loading panel unavailable.', error);
        }
    }

    private createRuntimeSpriteFrame(key: TextureKey, texture: Texture2D): SpriteFrame {
        const frame = this.context!.services.assets.createSpriteFrame(DOODLE_JUMP_RESOURCE_BUNDLE, texture);
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
            const inset = Math.max(8, Math.min(42, Math.floor(
                Math.min(texture.width, texture.height) * 0.18,
            )));
            frame.insetLeft = inset;
            frame.insetRight = inset;
            frame.insetTop = inset;
            frame.insetBottom = inset;
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

    private applyCarrotHudIcon(): void {
        const card = this.carrotCardNode;
        const frame = this.textureFrames.goldenCarrot;
        if (!card?.isValid || !frame) return;
        const width = 54 * frame.originalSize.width / frame.originalSize.height;
        if (!this.carrotHudIcon?.isValid) {
            this.carrotHudIcon = this.createSpriteNode(card, 'GoldenCarrotTarget', frame, width, 54, -48, -10);
        } else {
            this.carrotHudIcon.getComponent(UITransform)?.setContentSize(width, 54);
            this.setSpriteFrame(this.carrotHudIcon.getComponent(Sprite), frame);
        }
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
        applyHudFrame(this.carrotCardNode, 'hudCarrotCard');
        this.applyCarrotHudIcon();
        applyHudFrame(this.heightCardNode, 'hudHeightCard');
        this.itemStatusSlots.forEach((slot) => {
            this.setSpriteFrame(
                slot.fillSprite,
                this.textureFrames.hudItemProgressFill ?? null,
            );
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
                this.setSpriteColor(
                    iconSprite,
                    key === 'hudRulesButton' ? COLORS.rulesIcon : COLORS.white,
                );
            }
        };
        applyHudIconButton(this.pauseButton, 'hudPauseButton');
        applyHudIconButton(this.rulesButton, 'hudRulesButton');
        const loadingPanel = this.flowOverlayRoot?.getChildByName('LoadingOverlay');
        if (loadingPanel && this.textureFrames.panelLoading) {
            const sprite = this.applySpriteVisual(loadingPanel, this.textureFrames.panelLoading);
            sprite.node.setSiblingIndex(0);
        }
        this.applyLoadingRabbitArtwork();
        this.ensureParallaxNodes();
        this.updatePlayerVisual();
        const platformFrame = this.textureFrames.normalPlatform;
        if (platformFrame) {
            this.platformNodes.forEach((node, index) => {
                const width = this.config?.fixedPlatforms[index]?.width
                    ?? this.dynamicVisualRecords.get(node)?.width
                    ?? 150;
                this.setVisualSize(this.registerDynamicVisual(node), width, this.config?.platformBehavior.visualHeight ?? 42);
                this.applySpriteVisual(node, platformFrame);
                this.platformNodeTypes[index] = '';
            });
        }
        const reticleFrame = this.textureFrames.aimReticle;
        if (reticleFrame && this.aimReticleNode) {
            this.setVisualSize(this.registerDynamicVisual(this.aimReticleNode), 58, 58);
            this.applySpriteVisual(this.aimReticleNode, reticleFrame);
        }
        const landingDebrisFrame = this.textureFrames.landingPaperDebris;
        if (landingDebrisFrame) {
            this.landingDebrisVisualRecords.forEach((record) => {
                const node = record.node;
                const width = 172;
                const height = width
                    * Math.max(1, landingDebrisFrame.originalSize.height)
                    / Math.max(1, landingDebrisFrame.originalSize.width);
                this.setVisualSize(record, width, height);
                this.applySpriteVisual(node, landingDebrisFrame);
            });
        }
        const contactFrame = this.textureFrames.playerContactImpact;
        if (contactFrame && this.playerContactEffectNode) {
            const width = 220;
            const height = width
                * Math.max(1, contactFrame.originalSize.height)
                / Math.max(1, contactFrame.originalSize.width);
            this.setVisualSize(
                this.registerDynamicVisual(this.playerContactEffectNode),
                width,
                height,
            );
            this.applySpriteVisual(this.playerContactEffectNode, contactFrame);
            this.playerContactEffectNode.active = false;
        }
        this.fixPlayerVisualOrder();
        const snapshot = this.simulation?.getPresentationView();
        if (snapshot) this.updateParallaxBackground(snapshot.cameraBottomY, this.visibleSize);
    }

    private prewarmPresentationPools(): void {
        if (!this.config || !this.worldRoot) return;
        this.ensurePlatformNodes(this.config.generation.maxActivePlatforms);
        this.ensureEnemyNodes(this.config.enemies.maximumActive);
        this.ensureItemNodes(this.config.items.maximumActive);
        this.ensureHazardNodes(this.config.hazards.maximumActive);

        this.platformNodes.forEach((node, index) => {
            this.applyPlatformVisual(node, index, 'breakable', 0.42, false, 0);
            this.applyPlatformVisual(node, index, 'disappearing', 0.55, false, 0);
            this.applyPlatformVisual(node, index, 'exploding', 1.25, false, 0);
            this.resetReusableVisualNode(node);
            this.platformNodeTypes[index] = '';
        });

        const enemyTypes = DOODLE_JUMP_ENEMY_TYPES;
        this.enemyNodes.forEach((node, index) => {
            enemyTypes.forEach((type, typeIndex) => this.applyEnemyVisual(node, index, {
                id: `prewarm-enemy-${index}-${type}`,
                type,
                x: 0,
                y: 0,
                width: this.config!.enemies[type].width,
                height: this.config!.enemies[type].height,
                health: 1,
                maximumHealth: 1,
                hurt: typeIndex === 1,
                animationPhase: typeIndex * 0.2,
                anchorPlatformId: 'prewarm',
            }, typeIndex / 6));
            this.resetReusableVisualNode(node);
            this.enemyNodeTypes[index] = '';
        });

        const itemTypes = [
            'spring', 'trampoline', 'jetpack', 'propeller-hat', 'rocket', 'shield', 'spring-shoes',
        ] as const;
        this.itemNodes.forEach((node, index) => {
            itemTypes.forEach((type, typeIndex) => this.applyItemVisual(node, index, {
                id: `prewarm-item-${index}-${type}`,
                type,
                x: 0,
                y: 0,
                radius: 32,
                anchorPlatformId: 'prewarm',
                phase: typeIndex / itemTypes.length,
            }, 0));
            this.resetReusableVisualNode(node);
            this.itemNodeTypes[index] = '';
        });

        const hazardTypes = ['ufo', 'black-hole', 'bear-trap'] as const;
        this.hazardNodes.forEach((node, index) => {
            hazardTypes.forEach((type, typeIndex) => this.applyHazardVisual(node, index, {
                id: `prewarm-hazard-${index}-${type}`,
                type,
                x: 0,
                y: 0,
                width: 120,
                height: 100,
                anchorPlatformId: type === 'bear-trap' ? 'prewarm' : undefined,
                lockProgress: type === 'ufo' ? 0.7 : 0,
                abductionProgress: type === 'ufo' ? 0.4 : 0,
                paused: false,
                triggered: type === 'bear-trap',
                phase: typeIndex / hazardTypes.length,
            }, 0));
            this.resetReusableVisualNode(node);
            this.hazardNodeTypes[index] = '';
        });

        const prewarmCombatEvents: readonly DoodleJumpCombatEvent[] = [
            { type: 'hit', enemyId: 'prewarm', enemyType: 'small', x: 0, y: 0 },
            { type: 'kill', enemyId: 'prewarm', enemyType: 'large', x: 0, y: 0 },
        ];
        prewarmCombatEvents.forEach((event) => this.spawnCombatVisual(event));
        this.clearCombatVisuals(false);

        const projectile = this.obtainProjectileNode();
        this.resetReusableVisualNode(projectile);
        this.projectilePool.push(projectile);

        const primeFrame = (node: Node | undefined, key: TextureKey): void => {
            const frame = this.textureFrames[key];
            if (!node?.isValid || !frame) return;
            const directSprite = this.getDirectSprite(node);
            if (directSprite) this.setSpriteFrame(directSprite, frame);
            else this.applySpriteVisual(node, frame);
            this.resetReusableVisualNode(node);
        };
        primeFrame(this.failureHazardEffectNode, 'failureUfoCapture');
        primeFrame(this.failureHazardEffectNode, 'failureBlackHoleSuction');
        primeFrame(this.failureHazardEffectNode, 'failureBearTrapTrigger');
        primeFrame(this.failureHazardEffectNode, 'failureFalling');
        primeFrame(this.itemEffectNode, 'itemPickupSparkles');
        primeFrame(this.itemEffectNode, 'springRebound');
        primeFrame(this.itemEffectNode, 'trampolineRebound');
        primeFrame(this.playerMotionEffectNode, 'playerFallDrag');
        primeFrame(this.playerWrapEffectNode, 'playerScreenWrap');
        primeFrame(this.shieldPulseNode, 'shieldPulse');
        primeFrame(this.playerPowerEffectNode, 'jetpackFlames');
        primeFrame(this.playerPowerSecondaryEffectNode, 'flightPaperScraps');
        primeFrame(this.flightPowerDropBodyNode, 'itemJetpack');
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
            this.setNodeActive(node, frame !== undefined);
            if (!frame) return;
            this.setVisualSize(this.registerDynamicVisual(node), tileWidth, tileHeight + 2);
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
            ? ['decorWarmWildflowers', 'decorWarmGrass', 'decorWarmClover', 'decorWarmLeafSprig']
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
            let placement = this.backgroundDecorPlacements[slot];
            const sessionId = this.context?.sessionId;
            if (!placement || placement.seedIndex !== index || placement.parallaxY !== parallaxY
                || placement.viewportWidth !== visible.width || placement.sessionId !== sessionId) {
                const randomX = this.decorRandom(index, 1);
                const frames = this.selectDecorFrames(parallaxY / factor);
                this.setNodeActive(node, frames.length > 0);
                if (frames.length === 0) return;
                const frame = frames[Math.floor(this.decorRandom(index, 3) * frames.length)];
                const width = 88 + this.decorRandom(index, 4) * 62;
                const height = width
                    * Math.max(1, frame.originalSize.height)
                    / Math.max(1, frame.originalSize.width);
                this.setVisualSize(this.registerDynamicVisual(node), width, height);
                const horizontalInset = Math.min(visible.width / 2, width / 2 + 12);
                const x = -visible.width / 2 + horizontalInset
                    + randomX * Math.max(1, visible.width - horizontalInset * 2);
                node.setRotationFromEuler(0, 0, -14 + this.decorRandom(index, 5) * 28);
                const sprite = this.applySpriteVisual(node, frame);
                this.setSpriteColor(sprite, COLORS.decor);
                placement = { seedIndex: index, parallaxY, viewportWidth: visible.width, sessionId, x };
                this.backgroundDecorPlacements[slot] = placement;
            }
            // 图案、大小、旋转与横坐标固定，滚动期间只更新纵坐标。
            node.setPosition(placement.x, parallaxY - scroll - visible.height / 2, 0);
        });
    }

    private ensureBackgroundDecorPlacements(scroll: number, visible: Readonly<Size>): void {
        if (this.backgroundDecorParallaxYs.length === this.backgroundDecorNodes.length) return;
        this.backgroundDecorSeedIndices = [];
        this.backgroundDecorPlacements.length = 0;
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
            });
    }

    private updatePlayerVisual(
        horizontalVelocity = 0,
        itemStatus?: DoodleJumpItemStatusSnapshot,
        verticalVelocity = 0,
        elapsedSeconds = 0,
    ): void {
        if (!this.playerNode || !this.config) return;
        if (horizontalVelocity < -8) this.playerFacing = -1;
        else if (horizontalVelocity > 8) this.playerFacing = 1;
        const rotorEdge = Math.floor(elapsedSeconds * 20) % 2 === 1;
        const key: TextureKey = itemStatus?.flightPower === 'rocket' ? 'playerRocketRabbit'
            : itemStatus?.flightPower === 'jetpack' ? 'playerJetpackRabbit'
                : itemStatus?.flightPower === 'propeller-hat'
                    ? rotorEdge ? 'playerPropellerRabbitSpin' : 'playerPropellerRabbit'
                    : (itemStatus?.springShoesRemainingSeconds ?? 0) > 0
                        ? verticalVelocity < 0 ? 'playerShoesFalling' : 'playerShoesJumping'
                        : verticalVelocity < 0 ? 'playerFalling' : 'playerJumping';
        const frame = this.textureFrames[key];
        if (!frame) return;
        const layout = this.rabbitVisualLayout(itemStatus);
        const visualHeight = layout.height;
        const visualWidth = visualHeight
            * Math.max(1, frame.originalSize.width)
            / Math.max(1, frame.originalSize.height);
        this.setVisualSize(this.registerDynamicVisual(this.playerNode), visualWidth, visualHeight);
        this.applySpriteVisual(this.playerNode, frame);
        const visual = this.dynamicVisualRecords.get(this.playerNode)?.spriteVisual?.node;
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
            layout.offsetY,
            0,
        );
    }

    private rabbitVisualLayout(status?: DoodleJumpItemStatusSnapshot): Readonly<{
        height: number; offsetY: number; headY: number;
    }> {
        // Equipment is painted together with the rabbit. Keep its ears/body at the
        // same gameplay anchor while allowing the rocket to extend below the body.
        if (status?.flightPower === 'rocket') return { height: 206, offsetY: -10, headY: 104 };
        const hasShoes = !status?.flightPower && (status?.springShoesRemainingSeconds ?? 0) > 0;
        const height = hasShoes ? 156 : 140;
        const offsetY = height / 2 - (this.config?.player.collisionHeight ?? 82.03125) / 2 - 4;
        return { height, offsetY, headY: offsetY + height / 2 + 11 };
    }

    private fixPlayerVisualOrder(): void {
        if (!this.playerNode?.isValid) return;
        const playerBody = this.dynamicVisualRecords.get(this.playerNode)?.spriteVisual?.node;
        const orderedNodes: Array<Node | undefined> = [
            this.playerMotionEffectNode,
            this.playerWrapEffectNode,
            this.playerPowerSecondaryEffectNode,
            this.playerPowerEffectNode,
            playerBody,
            this.shieldOverlayNode,
            this.shieldPulseNode,
            this.playerContactEffectNode,
            this.failureHazardEffectNode,
        ];
        let siblingIndex = 0;
        orderedNodes.forEach((node) => {
            if (!node?.isValid || node.parent !== this.playerNode) return;
            node.setSiblingIndex(siblingIndex);
            siblingIndex += 1;
        });
    }

    private createSpringShoesVisual(parent: Node, name: string): Node {
        const root = new Node(name);
        root.layer = parent.layer; root.setParent(parent);
        root.addComponent(UITransform).setContentSize(72, 54);
        const graphics = root.addComponent(Graphics);
        graphics.lineWidth = 2.5; graphics.strokeColor = COLORS.ink;
        for (const centerX of [-18, 18]) {
            graphics.fillColor = new Color(225, 184, 111, 255);
            graphics.roundRect(centerX - 11, -22, 25, 10, 3); graphics.fill(); graphics.stroke();
            graphics.moveTo(centerX, -12);
            for (let turn = 0; turn < 6; turn++) graphics.lineTo(centerX + (turn % 2 === 0 ? -8 : 8), -8 + turn * 5);
            graphics.stroke();
            graphics.fillColor = COLORS.teal;
            graphics.roundRect(centerX - 10, 14, 22, 8, 2); graphics.fill(); graphics.stroke();
        }
        root.active = false;
        return root;
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

        const shield = new Node('ShieldOverlay');
        shield.layer = player.layer;
        shield.setParent(player);
        shield.addComponent(UITransform).setContentSize(188, 212);
        const shieldSprite = shield.addComponent(Sprite);
        shieldSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        shield.active = false;
        this.shieldOverlayNode = shield;
        this.shieldPulseNode = createEffect('ShieldPulseEffect', 206, 232);

    }

    private updatePlayerItemVisuals(
        status: DoodleJumpItemStatusSnapshot,
        elapsedSeconds: number,
        velocityY: number,
    ): void {
        const quality = this.visualQualityProfile();
        const motion = this.playerMotionEffectNode;
        if (motion?.isValid) {
            const motionKey: TextureKey | undefined = velocityY < -300
                ? 'playerFallDrag'
                : undefined;
            const motionFrame = motionKey ? this.textureFrames[motionKey] : undefined;
            this.setNodeActive(motion, motionFrame !== undefined);
            if (motionFrame) {
                const sprite = this.getDirectSprite(motion);
                if (sprite) this.setSpriteFrame(sprite, motionFrame);
                motion.setPosition(0, 22, 0);
                motion.setScale(
                    quality.effectScale * 0.72,
                    quality.effectScale * 0.72,
                    1,
                );
                const opacity = this.getVisualOpacity(motion);
                this.setOpacity(opacity, quality.secondaryEffects ? 190 : 130);
            }
        }
        const wrap = this.playerWrapEffectNode;
        const wrapFrame = this.textureFrames.playerScreenWrap;
        if (wrap?.isValid) {
            this.setNodeActive(wrap, this.wrapEffectRemaining > 0 && wrapFrame !== undefined);
            if (wrap.active && wrapFrame) {
                const sprite = this.getDirectSprite(wrap);
                if (sprite) this.setSpriteFrame(sprite, wrapFrame);
                const progress = 1 - this.wrapEffectRemaining / 0.28;
                wrap.setScale(0.86 + progress * 0.2, 0.86 + progress * 0.2, 1);
                const opacity = this.getVisualOpacity(wrap);
                this.setOpacity(opacity, Math.round(210 * (1 - progress)));
            }
        }
        const shield = this.shieldOverlayNode;
        const shieldFrame = this.textureFrames.shieldOverlay;
        if (shield?.isValid) {
            this.setNodeActive(shield, status.shieldRemainingSeconds > 0 && shieldFrame !== undefined);
            if (shield.active && shieldFrame) {
                const sprite = this.getDirectSprite(shield);
                if (sprite) this.setSpriteFrame(sprite, shieldFrame);
                const layout = this.rabbitVisualLayout(status);
                const rocket = status.flightPower === 'rocket';
                this.setVisualSize(this.registerDynamicVisual(shield), rocket ? 196 : 188, rocket ? 250 : 212);
                shield.setPosition(0, rocket ? -6 : layout.offsetY, 0);
                shield.setScale(
                    1 + Math.sin(elapsedSeconds * 5) * 0.035,
                    1 + Math.sin(elapsedSeconds * 5) * 0.035,
                    1,
                );
            }
        }
        const shieldPulse = this.shieldPulseNode;
        const shieldPulseFrame = this.textureFrames.shieldPulse;
        if (shieldPulse?.isValid) {
            this.setNodeActive(
                shieldPulse,
                quality.secondaryEffects
                    && status.shieldRemainingSeconds > 0
                    && shieldPulseFrame !== undefined,
            );
            if (shieldPulse.active && shieldPulseFrame) {
                const sprite = this.getDirectSprite(shieldPulse);
                if (sprite) this.setSpriteFrame(sprite, shieldPulseFrame);
                const layout = this.rabbitVisualLayout(status);
                const rocket = status.flightPower === 'rocket';
                this.setVisualSize(this.registerDynamicVisual(shieldPulse), rocket ? 214 : 206, rocket ? 270 : 232);
                shieldPulse.setPosition(0, rocket ? -6 : layout.offsetY, 0);
                const pulse = 0.9 + (Math.sin(elapsedSeconds * 5) + 1) * 0.08;
                shieldPulse.setScale(pulse * quality.effectScale, pulse * quality.effectScale, 1);
                const opacity = this.getVisualOpacity(shieldPulse);
                this.setOpacity(
                    opacity,
                    82 + Math.round((Math.sin(elapsedSeconds * 5) + 1) * 38),
                );
            }
        }
        const effect = this.playerPowerEffectNode;
        const secondary = this.playerPowerSecondaryEffectNode;
        if (secondary?.isValid) this.setNodeActive(secondary, false);
        if (!effect?.isValid) return;
        const key = status.headStartRemainingSeconds > 0 ? 'headStartBurst'
            : status.flightPower === 'jetpack' ? 'jetpackFlames'
                : status.flightPower === 'rocket' ? 'rocketFlame'
                    : undefined;
        const frame = key ? this.textureFrames[key as TextureKey] : undefined;
        this.setNodeActive(effect, frame !== undefined);
        if (!frame) return;
        const effectSprite = this.getDirectSprite(effect);
        if (effectSprite) this.setSpriteFrame(effectSprite, frame);
        const width = status.flightPower === 'jetpack' ? 38 : status.flightPower === 'rocket' ? 54 : 112;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        this.setVisualSize(this.registerDynamicVisual(effect), width, height);
        const nozzleX = status.flightPower === 'jetpack' ? -31 * this.playerFacing
            : status.flightPower === 'rocket' ? 4 * this.playerFacing : 0;
        const nozzleY = status.flightPower === 'rocket' ? -103 : -7;
        effect.setPosition(nozzleX, status.headStartRemainingSeconds > 0
            ? -56 : nozzleY - height / 2 + 6, 0);
        effect.setScale(1 + Math.sin(elapsedSeconds * 12) * 0.04, 1, 1);

        if (!secondary?.isValid) return;
        const secondaryKey: TextureKey | undefined = status.flightPower === 'jetpack'
            ? 'flightPaperScraps'
            : status.flightPower === 'rocket'
                ? elapsedSeconds % 0.24 < 0.12 ? 'flightPaperScraps' : 'rocketTrail'
                : undefined;
        const secondaryFrame = secondaryKey && quality.secondaryEffects
            ? this.textureFrames[secondaryKey]
            : undefined;
        this.setNodeActive(secondary, secondaryFrame !== undefined);
        if (secondaryFrame) {
            const sprite = this.getDirectSprite(secondary);
            if (sprite) this.setSpriteFrame(sprite, secondaryFrame);
            const width = 124;
            const height = width
                * Math.max(1, secondaryFrame.originalSize.height)
                / Math.max(1, secondaryFrame.originalSize.width);
            this.setVisualSize(this.registerDynamicVisual(secondary), width, height);
            secondary.setPosition(nozzleX, nozzleY - 35, 0);
            secondary.setScale(quality.effectScale, quality.effectScale, 1);
        }
    }

    private updateItemHud(
        status: DoodleJumpItemStatusSnapshot,
        playerVelocityY: number,
    ): void {
        const frameNode = this.itemStatusFrameNode;
        if (!frameNode?.isValid) return;
        let entryCount = 0;
        if (status.landingPower) {
            entryCount = this.appendItemHudEntry(
                entryCount,
                status.landingPower === 'spring'
                    ? 'itemIconSpring'
                    : 'itemIconTrampoline',
            );
        }
        if (status.headStartRemainingSeconds > 0) {
            entryCount = this.appendItemHudEntry(
                entryCount,
                'itemIconHeadStart',
                status.headStartRemainingSeconds
                    / Math.max(0.001, this.config?.items.headStart.durationSeconds ?? 1.2),
            );
        } else if (status.flightPower) {
            const iconKey: TextureKey = status.flightPower === 'jetpack' ? 'itemIconJetpack'
                : status.flightPower === 'propeller-hat' ? 'itemIconPropellerHat'
                    : 'itemIconRocket';
            const duration = status.flightPower === 'jetpack'
                ? this.config?.items.jetpack.durationSeconds ?? 1.8
                : status.flightPower === 'propeller-hat'
                    ? this.config?.items.propellerHat.durationSeconds ?? 1.8
                    : this.config?.items.rocket.durationSeconds ?? 1.8;
            entryCount = this.appendItemHudEntry(
                entryCount,
                iconKey,
                status.flightRemainingSeconds / Math.max(0.001, duration),
            );
        }
        if (status.springShoesRemainingSeconds > 0) {
            entryCount = this.appendItemHudEntry(entryCount, 'itemIconSpring', status.springShoesRemainingSeconds
                / Math.max(0.001, this.config?.items.springShoes.durationSeconds ?? 500 / 60));
        }
        if (status.shieldRemainingSeconds > 0) {
            entryCount = this.appendItemHudEntry(
                entryCount,
                'itemIconShield',
                status.shieldRemainingSeconds
                    / Math.max(0.001, this.config?.items.shield.durationSeconds ?? 6),
            );
        }
        this.setNodeActive(frameNode, entryCount > 0 && this.stateMachine.state === 'Playing');
        let cursorX = 0;
        this.itemStatusSlots.forEach((slot, index) => {
            const iconKey = index < entryCount ? this.itemHudIconKeys[index] : undefined;
            this.setNodeActive(slot.root, iconKey !== undefined);
            if (!iconKey) return;
            const timed = this.itemHudTimed[index];
            const slotWidth = timed ? 170 : 54;
            slot.root.setPosition(cursorX + slotWidth / 2, 0, 0);
            this.setSpriteFrame(slot.icon, this.textureFrames[iconKey] ?? null);
            slot.icon.node.setPosition(timed ? -61 : 0, 0, 0);
            this.setNodeActive(slot.track, timed);
            if (timed) {
                this.setSpriteFrame(
                    slot.fillSprite,
                    this.textureFrames.hudItemProgressFill ?? null,
                );
                slot.fill.setScale(
                    Math.max(0.025, Math.min(1, this.itemHudRatios[index])),
                    1,
                    1,
                );
            }
            cursorX += slotWidth + 8;
        });
    }

    private appendItemHudEntry(
        index: number,
        iconKey: TextureKey,
        ratio?: number,
    ): number {
        if (index >= this.itemHudIconKeys.length) return index;
        this.itemHudIconKeys[index] = iconKey;
        this.itemHudTimed[index] = ratio !== undefined;
        this.itemHudRatios[index] = ratio ?? 0;
        return index + 1;
    }

    private captureLandingEffect(
        snapshot: DoodleJumpSimulationPresentationView,
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
        const cameraBottomY = cameraCenterY - this.visibleSize.height / 2;
        const renderVisible = this.isVerticalVisualVisible(
            this.landingDebrisWorldY - 80,
            this.landingDebrisWorldY + 150,
            cameraBottomY,
            100,
            160,
        );
        this.setNodeActive(effect, renderVisible);
        if (!renderVisible) return;
        const elapsed = LANDING_DEBRIS_DURATION - this.landingDebrisRemaining;
        const progress = elapsed / LANDING_DEBRIS_DURATION;
        effect.setPosition(
            this.landingDebrisWorldX - centerX,
            this.landingDebrisWorldY - cameraCenterY,
            0,
        );
        const fadeProgress = Math.max(0, (progress - 0.18) / 0.82);
        const opacity = Math.max(0, Math.round(255 * Math.pow(1 - fadeProgress, 1.25)));
        this.landingDebrisVisualRecords.forEach((visualRecord) => {
            const visual = visualRecord.node;
            if (!visual.isValid) return;
            const scale = 0.72 + progress * 0.36;
            const visualHeight = visualRecord.height;
            visual.setPosition(
                0,
                visualHeight * scale / 2,
                0,
            );
            visual.setScale(scale, scale, 1);
            const fade = visualRecord.opacity;
            this.setOpacity(fade, opacity);
        });
    }

    private createLandingDebrisEffect(): void {
        if (!this.worldEffectLayer) return;
        const root = new Node('LandingPaperDebrisEffect');
        root.layer = this.node.layer;
        root.setParent(this.worldEffectLayer);
        root.addComponent(UITransform).setContentSize(220, 130);
        root.active = false;
        this.landingDebrisVisualRecords = [0].map((index) => {
            const visual = new Node(`LandingPaperScraps-${index}`);
            visual.layer = this.node.layer;
            visual.setParent(root);
            const transform = visual.addComponent(UITransform);
            transform.setContentSize(172, 91);
            const opacity = visual.addComponent(UIOpacity);
            opacity.opacity = 0;
            const record = this.registerDynamicVisual(visual, transform);
            record.opacity = opacity;
            return record;
        });
        this.landingDebrisVisuals = this.landingDebrisVisualRecords.map((record) => record.node);
        this.landingDebrisRoot = root;
    }

    private createPlayerContactEffect(player: Node): void {
        const effect = new Node('PlayerEnemyContactImpact');
        effect.layer = player.layer;
        effect.setParent(player);
        const transform = effect.addComponent(UITransform);
        transform.setContentSize(220, 220);
        const opacity = effect.addComponent(UIOpacity);
        opacity.opacity = 0;
        const record = this.registerDynamicVisual(effect, transform);
        record.opacity = opacity;
        effect.active = false;
        this.playerContactEffectNode = effect;
    }

    private createHazardFailureEffect(player: Node): void {
        const effect = new Node('PlayerHazardFailureEffect');
        effect.layer = player.layer;
        effect.setParent(player);
        const transform = effect.addComponent(UITransform);
        transform.setContentSize(190, 190);
        const opacity = effect.addComponent(UIOpacity);
        opacity.opacity = 255;
        const record = this.registerDynamicVisual(effect, transform);
        record.opacity = opacity;
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
                : reason === 'bear-trap'
                    ? this.textureFrames.failureBearTrapTrigger
                    : reason === 'fall'
                        ? this.textureFrames.failureFalling
                        : undefined;
        this.setNodeActive(effect, frame !== undefined);
        if (!frame) return;
        const width = reason === 'black-hole' ? 210 : 184;
        const height = width
            * Math.max(1, frame.originalSize.height)
            / Math.max(1, frame.originalSize.width);
        this.setVisualSize(this.registerDynamicVisual(effect), width, height);
        this.applySpriteVisual(effect, frame);
        effect.setPosition(
            0,
            reason === 'bear-trap' ? -34 : reason === 'fall' ? 8 : 4,
            0,
        );
        effect.setScale(0.92, 0.92, 1);
        effect.setRotationFromEuler(0, 0, 0);
        const opacity = this.getVisualOpacity(effect);
        this.setOpacity(opacity, 255);
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
            const opacity = this.getVisualOpacity(this.playerNode);
            this.setOpacity(opacity, 255);
        }
        if (this.failureHazardEffectNode?.isValid) {
            this.setNodeActive(this.failureHazardEffectNode, false);
        }
    }

    private failureReasonText(reason: DoodleJumpFailureReason): string {
        if (reason === 'monster-contact') return '撞到了怪物';
        if (reason === 'ufo-abduction') return '被 UFO 光束带走';
        if (reason === 'black-hole') return '被黑洞吸入';
        if (reason === 'bear-trap') return '触发了捕兽夹';
        if (reason === 'ufo-contact') return '撞到了飞碟';
        return '没有落到下一块平台';
    }

    private startPlayerContactEffect(): void {
        const effect = this.playerContactEffectNode;
        if (!effect?.isValid) return;
        this.playerContactEffectRemaining = PLAYER_CONTACT_IMPACT_DURATION;
        this.setNodeActive(effect, true);
        effect.setPosition(0, 18, 0);
        effect.setScale(0.78, 0.78, 1);
        effect.setRotationFromEuler(0, 0, -5);
        const opacity = this.getVisualOpacity(effect);
        this.setOpacity(opacity, 255);
    }

    private updatePlayerContactEffect(deltaTime: number): void {
        const effect = this.playerContactEffectNode;
        if (!effect?.isValid || this.playerContactEffectRemaining <= 0) {
            if (effect?.isValid) this.setNodeActive(effect, false);
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
        const fadeProgress = Math.max(0, (progress - 0.28) / 0.72);
        const opacity = this.getVisualOpacity(effect);
        this.setOpacity(opacity, Math.max(0, Math.round(255 * (1 - fadeProgress))));
        if (this.playerContactEffectRemaining <= 0) this.setNodeActive(effect, false);
    }

    private registerDynamicVisual(
        node: Node,
        transform?: UITransform,
        fallbackGraphics?: Graphics,
    ): DoodleJumpDynamicVisualRecord {
        const cached = this.dynamicVisualRecords.get(node);
        if (cached) return cached;
        const resolvedTransform = transform
            ?? node.getComponent(UITransform)
            ?? node.addComponent(UITransform);
        const record: DoodleJumpDynamicVisualRecord = {
            node,
            transform: resolvedTransform,
            fallbackGraphics: fallbackGraphics ?? node.getComponent(Graphics) ?? undefined,
            children: {},
            width: resolvedTransform.contentSize.width,
            height: resolvedTransform.contentSize.height,
        };
        this.dynamicVisualRecords.set(node, record);
        return record;
    }

    private reserveVisualSlot(
        entityId: string,
        state: DoodleJumpVisualSlotState,
    ): number {
        const existing = state.slotByEntityId.get(entityId);
        if (existing !== undefined) {
            state.seenEpochBySlot[existing] = this.visualSlotEpoch;
            return existing;
        }
        const recycled = state.freeSlots.pop();
        const slot = recycled ?? state.entityIdBySlot.length;
        state.slotByEntityId.set(entityId, slot);
        state.entityIdBySlot[slot] = entityId;
        state.seenEpochBySlot[slot] = this.visualSlotEpoch;
        return slot;
    }

    private releaseUnseenVisualSlots(
        state: DoodleJumpVisualSlotState,
        nodes: readonly Node[],
    ): void {
        for (let slot = 0; slot < state.entityIdBySlot.length; slot += 1) {
            const entityId = state.entityIdBySlot[slot];
            if (!entityId || state.seenEpochBySlot[slot] === this.visualSlotEpoch) continue;
            state.slotByEntityId.delete(entityId);
            state.entityIdBySlot[slot] = undefined;
            state.freeSlots.push(slot);
            const node = nodes[slot];
            if (node?.isValid) this.setNodeActive(node, false);
        }
    }

    private resetVisualSlotState(state: DoodleJumpVisualSlotState): void {
        state.slotByEntityId.clear();
        state.entityIdBySlot.length = 0;
        state.seenEpochBySlot.length = 0;
        state.freeSlots.length = 0;
    }

    private isVerticalVisualVisible(
        bottom: number,
        top: number,
        cameraBottomY: number,
        reserveBelow: number,
        reserveAbove: number,
    ): boolean {
        return top >= cameraBottomY - reserveBelow
            && bottom <= cameraBottomY + this.visibleSize.height + reserveAbove;
    }

    private setVisualSize(
        record: DoodleJumpDynamicVisualRecord | DoodleJumpSpriteVisualRecord,
        width: number,
        height: number,
    ): void {
        if ('width' in record) {
            if (record.width === width && record.height === height) return;
            record.width = width;
            record.height = height;
        } else if (record.transform.contentSize.width === width
            && record.transform.contentSize.height === height) return;
        record.transform.setContentSize(width, height);
    }

    private setNodeActive(node: Node, active: boolean): void {
        if (node.active !== active) node.active = active;
    }

    private setSpriteFrame(sprite: Sprite, frame: SpriteFrame | null): void {
        if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame;
    }

    private getDirectSprite(node: Node): Sprite | null {
        const record = this.registerDynamicVisual(node);
        if (record.directSprite === undefined) record.directSprite = node.getComponent(Sprite);
        return record.directSprite;
    }

    private getVisualOpacity(node: Node): UIOpacity | null {
        const record = this.registerDynamicVisual(node);
        if (record.opacity === undefined) record.opacity = node.getComponent(UIOpacity);
        return record.opacity;
    }

    private ensureVisualOpacity(node: Node): UIOpacity {
        const record = this.registerDynamicVisual(node);
        const opacity = record.opacity ?? node.addComponent(UIOpacity);
        record.opacity = opacity;
        return opacity;
    }

    private setSpriteColor(sprite: Sprite, color: Readonly<Color>): void {
        const current = sprite.color;
        if (current.r !== color.r || current.g !== color.g
            || current.b !== color.b || current.a !== color.a) {
            sprite.color = color;
        }
    }

    private setLabelText(label: Label | undefined, value: string): void {
        if (label && label.string !== value) label.string = value;
    }

    private setOpacity(opacity: UIOpacity | null | undefined, value: number): void {
        if (opacity && opacity.opacity !== value) opacity.opacity = value;
    }

    private whiteAlpha(alpha: number): Color {
        return WHITE_ALPHA_COLORS[Math.max(0, Math.min(255, Math.round(alpha)))];
    }

    private applySpriteVisual(node: Node, frame: SpriteFrame): Sprite {
        const record = this.registerDynamicVisual(node);
        if (record.fallbackGraphics?.enabled) record.fallbackGraphics.enabled = false;
        let visual = record.spriteVisual;
        if (!visual) {
            const visualNode = new Node('SpriteVisual');
            visualNode.layer = node.layer;
            visualNode.setParent(node);
            const transform = visualNode.addComponent(UITransform);
            const sprite = visualNode.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            visual = { node: visualNode, transform, sprite };
            record.spriteVisual = visual;
        }
        this.setVisualSize(visual, record.width, record.height);
        const spriteType = this.slicedFrames.has(frame) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        if (visual.sprite.type !== spriteType) visual.sprite.type = spriteType;
        this.setSpriteFrame(visual.sprite, frame);
        return visual.sprite;
    }

    private syncSpriteVisualSize(node: Node): void {
        const record = this.dynamicVisualRecords.get(node);
        if (!record?.spriteVisual) return;
        this.setVisualSize(record.spriteVisual, record.width, record.height);
    }

    private getSpriteVisual(node: Node): Sprite | null {
        return this.dynamicVisualRecords.get(node)?.spriteVisual?.sprite ?? null;
    }

    private createRoundSummary(
        parent: Node,
        carrotCount: number,
        heightMeters: number,
        centerY: number,
        isNewBestCarrotCount = false,
        isNewBestHeight = false,
        history?: Readonly<{ bestHeightMeters: number; bestCarrotCount: number }>,
    ): void {
        const paper = this.createGraphicsNode(parent, 'RoundSummaryPaper', 448, 210);
        paper.setPosition(0, centerY, 0);
        const paperGraphics = paper.getComponent(Graphics)!;
        paperGraphics.fillColor = new Color(255, 253, 239, 150);
        paperGraphics.strokeColor = new Color(139, 151, 125, 100);
        paperGraphics.lineWidth = 1.5;
        paperGraphics.moveTo(-224, -101);
        paperGraphics.lineTo(-225, 100);
        paperGraphics.lineTo(-132, 103);
        paperGraphics.lineTo(-39, 99);
        paperGraphics.lineTo(57, 103);
        paperGraphics.lineTo(224, 100);
        paperGraphics.lineTo(225, -102);
        paperGraphics.lineTo(132, -100);
        paperGraphics.lineTo(35, -104);
        paperGraphics.lineTo(-88, -100);
        paperGraphics.close();
        paperGraphics.fill();
        paperGraphics.stroke();
        paperGraphics.strokeColor = new Color(117, 137, 117, 125);
        paperGraphics.lineWidth = 2;
        for (let y = -79; y < 85; y += 15) {
            paperGraphics.moveTo(0, y);
            paperGraphics.lineTo(0, y + 7);
        }
        paperGraphics.stroke();
        const metrics = [
            {
                card: 'RoundDistanceSummary', caption: 'RoundDistanceCaption',
                value: 'RoundDistance', unit: 'RoundDistanceUnit', title: '路程',
                amount: heightMeters, suffix: '米', x: -112,
                record: 'NewHeightRecord', isNewBest: isNewBestHeight,
                history: 'BestHeight', historyTitle: '历史最高', bestAmount: history?.bestHeightMeters,
            },
            {
                card: 'RoundCarrotSummary', caption: 'RoundCarrotCaption',
                value: 'RoundCarrotCount', unit: 'RoundCarrotUnit', title: '金萝卜',
                amount: carrotCount, suffix: '根', x: 112,
                record: 'NewCarrotRecord', isNewBest: isNewBestCarrotCount,
                history: 'BestCarrotCount', historyTitle: '历史最多', bestAmount: history?.bestCarrotCount,
            },
        ] as const;
        metrics.forEach((metric) => {
            const card = this.createGraphicsNode(parent, metric.card, 208, 210);
            card.setPosition(metric.x, centerY, 0);
            const graphics = card.getComponent(Graphics)!;
            graphics.strokeColor = new Color(139, 151, 125, 105);
            graphics.lineWidth = 2;
            graphics.moveTo(-68, -65);
            graphics.lineTo(-21, -63);
            graphics.lineTo(26, -65);
            graphics.lineTo(68, -63);
            graphics.stroke();
            this.createLabel(
                card, metric.caption, metric.title,
                19, 71, 22, COLORS.tealDark, 124, 36,
            );
            if (metric.value === 'RoundCarrotCount') {
                const frame = this.textureFrames.goldenCarrot;
                if (frame) {
                    const icon = this.createGraphicsNode(
                        card, 'RoundGoldenCarrot',
                        38 * frame.originalSize.width / frame.originalSize.height, 38,
                    );
                    icon.setPosition(-52, 71, 0);
                    this.applySpriteVisual(icon, frame);
                }
            } else {
                const icon = this.createGraphicsNode(card, 'RoundHeightIcon', 36, 32);
                icon.setPosition(-44, 71, 0);
                const iconGraphics = icon.getComponent(Graphics)!;
                iconGraphics.fillColor = new Color(67, 154, 151, 38);
                iconGraphics.strokeColor = COLORS.tealDark;
                iconGraphics.lineWidth = 2.5;
                iconGraphics.moveTo(-17, -12);
                iconGraphics.lineTo(-5, 13);
                iconGraphics.lineTo(2, -1);
                iconGraphics.lineTo(8, 8);
                iconGraphics.lineTo(17, -12);
                iconGraphics.close();
                iconGraphics.fill();
                iconGraphics.stroke();
                iconGraphics.moveTo(-9, 4);
                iconGraphics.lineTo(-5, 1);
                iconGraphics.lineTo(-1, 5);
                iconGraphics.stroke();
            }
            const value = this.createLabel(
                card, metric.value, String(metric.amount),
                0, 7, 60, COLORS.ink, 180, 82,
            );
            value.isBold = true;
            value.overflow = Label.Overflow.SHRINK;
            this.createLabel(
                card, metric.unit, metric.suffix,
                0, -48, 20, COLORS.muted, history ? 58 : 150, 30,
            );
            if (metric.isNewBest) {
                this.createLabel(
                    card, metric.record, '新纪录',
                    history ? 67 : 0, history ? -48 : -80,
                    history ? 14 : 16, COLORS.coral, history ? 68 : 150, 26,
                );
            }
            if (history) {
                const best = this.createLabel(
                    card, metric.history, `${metric.historyTitle} ${metric.bestAmount} ${metric.suffix}`,
                    0, -80, 16, COLORS.muted, 198, 26,
                );
                best.overflow = Label.Overflow.SHRINK;
            }
        });
    }

    private createOverlay(
        name: string,
        title: string,
        message: string,
        panelKey: TextureKey = 'panelReady',
        layer: 'flow' | 'pause' = 'flow',
        animatePanel = true,
        panelHeight = 590,
        bottomPadding = 0,
    ): Node {
        const targetRoot = layer === 'pause' ? this.pauseOverlayRoot : this.flowOverlayRoot;
        if (!targetRoot) throw new Error(`${layer} overlay root is unavailable.`);
        if (this.overlayRoot?.isValid) this.overlayRoot.active = true;
        const visible = this.visibleSize;
        const layout = this.context?.services.platform.getLayoutInfo();
        const safe = calculateVerticalSafeBounds(visible.height, layout, 18);
        const availableHeight = Math.max(1, safe.topY - safe.bottomY - 32);
        const fullPanelHeight = panelHeight + bottomPadding;
        const panelScale = Math.min(1, availableHeight / fullPanelHeight);
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
            fullPanelHeight,
        );
        const scaledHalfHeight = fullPanelHeight * panelScale / 2;
        const panelCenterY = Math.max(
            safe.bottomY + 16 + scaledHalfHeight,
            Math.min(
                safe.topY - 16 - scaledHalfHeight,
                (safe.topY + safe.bottomY) / 2 - bottomPadding * panelScale / 2,
            ),
        );
        panel.setPosition(0, panelCenterY, 0);
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
        const halfPanelHeight = fullPanelHeight / 2;
        const graphics = panel.getComponent(Graphics)!;
        graphics.fillColor = COLORS.paperOverlay;
        graphics.roundRect(-width / 2, -halfPanelHeight, width, fullPanelHeight, 32);
        graphics.fill();
        graphics.strokeColor = COLORS.ink;
        graphics.lineWidth = 5;
        graphics.roundRect(-width / 2, -halfPanelHeight, width, fullPanelHeight, 32);
        graphics.stroke();
        const panelFrame = this.textureFrames[panelKey];
        if (panelFrame) {
            const sprite = this.applySpriteVisual(panel, panelFrame);
            sprite.node.setSiblingIndex(0);
        }
        // Extend the paper below the existing content instead of moving its buttons up.
        const content = bottomPadding > 0 ? new Node('OverlayContent') : panel;
        if (content !== panel) {
            content.layer = panel.layer;
            content.setParent(panel);
            content.setPosition(0, bottomPadding / 2, 0);
            content.addComponent(UITransform).setContentSize(width, panelHeight);
        }
        if (title.length > 0) {
            this.createLabel(
                content,
                'Title',
                title,
                0,
                panelHeight / 2 - 90,
                38,
                COLORS.ink,
                width - 90,
                64,
            );
        }
        if (message.length > 0) {
            const messageLabel = this.createLabel(
                content,
                'Message',
                message,
                0,
                panelHeight / 2 - 158,
                22,
                COLORS.muted,
                width - 90,
                92,
            );
            messageLabel.overflow = Label.Overflow.SHRINK;
        }
        return content;
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
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        const graphics = node.addComponent(Graphics);
        this.registerDynamicVisual(node, transform, graphics);
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
        return this.context!.services.assets.loadAsset(DOODLE_JUMP_RESOURCE_BUNDLE, path, Texture2D);
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
            // TODO: console.warn('[DoodleJumpGame] Rewarded video icon unavailable.', error);
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
        this.unbindWebPointerListeners();
        this.clearCarrotVisuals();
        this.resetShootingRuntime(true);
        this.clearCombatVisuals(true);
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
            this.releaseDynamicVisualTree(root);
            root.destroy();
        }
        this.dynamicRoot = undefined;
        this.backgroundRoot = undefined;
        this.backgroundBaseNodes = [];
        this.backgroundDecorNodes = [];
        this.backgroundDecorSeedIndices = [];
        this.backgroundDecorPlacements.length = 0;
        this.backgroundDecorParallaxYs = [];
        this.nextBackgroundDecorSeedIndex = 0;
        this.worldRoot = undefined;
        this.platformLayer = undefined;
        this.entityLayer = undefined;
        this.projectileLayer = undefined;
        this.worldEffectLayer = undefined;
        this.playerLayer = undefined;
        this.reticleLayer = undefined;
        this.uiRoot = undefined;
        this.overlayRoot = undefined;
        this.flowOverlayRoot = undefined;
        this.pauseOverlayRoot = undefined;
        this.resumeCountdownLabel = undefined;
        this.playerNode = undefined;
        this.playerMotionEffectNode = undefined;
        this.playerWrapEffectNode = undefined;
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
        this.landingDebrisVisualRecords = [];
        this.landingDebrisRemaining = 0;
        this.observedLandingCount = 0;
        this.aimReticleNode = undefined;
        this.platformNodes = [];
        this.platformVisualRecords = [];
        this.platformNodeTypes = [];
        this.enemyNodes = [];
        this.enemyVisualRecords = [];
        this.enemyNodeTypes = [];
        this.hazardNodes = [];
        this.hazardVisualRecords = [];
        this.hazardNodeTypes = [];
        this.itemNodes = [];
        this.itemVisualRecords = [];
        this.itemNodeTypes = [];
        this.resetVisualSlotState(this.platformSlots);
        this.resetVisualSlotState(this.itemSlots);
        this.resetVisualSlotState(this.enemySlots);
        this.resetVisualSlotState(this.hazardSlots);
        this.visualSlotEpoch = 0;
        this.shieldOverlayNode = undefined;
        this.playerPowerEffectNode = undefined;
        this.itemEffectNode = undefined;
        this.itemEffectRemaining = 0;
        this.itemEffectKey = undefined;
        this.flightPowerDropRoot = undefined;
        this.flightPowerDropBodyNode = undefined;
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
        this.carrotLabel = undefined;
        this.carrotCardNode = undefined;
        this.carrotHudIcon = undefined;
        this.carrotFlightLayer = undefined;
        this.carrotWorldLayer = undefined;
        this.heightCardNode = undefined;
        this.itemStatusFrameNode = undefined;
        this.itemStatusSlots = [];
        this.pauseButton = undefined;
        this.rulesButton = undefined;
        this.overlayButtons = [];
        this.pauseOverlayButtons = [];
        this.disabledButtons.clear();
        this.dynamicVisualRecords.clear();
    }

    private releaseDynamicVisualTree(node: Node): void {
        // 弹窗反复打开时，不能让组件缓存持有已销毁的整棵 UI 子树。
        // UIOpacity 动画以组件为目标，也需要随节点一起停止。
        Tween.stopAllByTarget(node);
        const opacity = node.getComponent(UIOpacity);
        if (opacity) Tween.stopAllByTarget(opacity);
        this.dynamicVisualRecords.delete(node);
        this.carrotVisuals.delete(node);
        for (let index = 0; index < node.children.length; index += 1) {
            this.releaseDynamicVisualTree(node.children[index]);
        }
    }

    private destroyOverlay(): void {
        this.overlayButtons.forEach((button) => this.disabledButtons.delete(button));
        this.overlayButtons = [];
        this.flowOverlayRoot?.children.slice().forEach((child) => {
            child.active = false;
            this.releaseDynamicVisualTree(child);
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
            this.releaseDynamicVisualTree(child);
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
        this.beginWebPointerDrag(location.x);
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
        if (!this.inputController?.supportsPointerControl()) this.tryFireCarrot();
    };

    private readonly handleGameplayTouchMove = (event: EventTouch): void => {
        if (this.stateMachine.state !== 'Playing'
            || this.attackPointerId !== event.getID()) return;
        const location = event.getUILocation();
        if (this.moveWebPointerDrag(location.x)) return;
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
    };

    private readonly handleGameplayRelease = (event: EventTouch): void => {
        this.lastPointerReleaseAt = Date.now();
        if (this.attackPointerId === event.getID()) {
            this.finishWebPointerDrag(event);
            // Release stops auto-fire but preserves the tap queued for the next physics step.
            this.cancelAttack(true, false);
        }
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
        this.beginWebPointerDrag(location.x);
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
        if (!this.inputController?.supportsPointerControl()) this.tryFireCarrot();
    };

    private readonly handleGameplayMouseMove = (event: EventMouse): void => {
        if (!this.mouseAttackHeld || this.stateMachine.state !== 'Playing') return;
        const location = event.getUILocation();
        if (this.moveWebPointerDrag(location.x)) return;
        const screenLocation = event.getLocation();
        this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
    };

    private readonly handleGameplayMouseRelease = (event: EventMouse): void => {
        if (Date.now() - this.lastPointerReleaseAt < 500) return;
        if (this.mouseAttackHeld) {
            this.finishWebPointerDrag(event);
            // Release stops auto-fire but preserves the tap queued for the next physics step.
            this.cancelAttack(true, false);
        }
    };

    private beginWebPointerDrag(uiX: number): void {
        if (!this.config || !this.simulation) return;
        this.inputController?.beginPointerDrag(
            uiX / this.visibleSize.width * this.config.design.width,
            this.simulation.getPresentedPlayerX(),
        );
    }

    private moveWebPointerDrag(uiX: number): boolean {
        if (!this.config) return false;
        const moved = this.inputController?.movePointerDrag(
            uiX / this.visibleSize.width * this.config.design.width,
        ) === true;
        if (moved && this.aimReticleNode?.isValid) this.aimReticleNode.active = false;
        return moved;
    }

    private finishWebPointerDrag(event: EventTouch | EventMouse): void {
        if (!this.inputController?.supportsPointerControl()) return;
        const location = event.getUILocation();
        this.moveWebPointerDrag(location.x);
        const moved = this.inputController.endPointerDrag();
        if (!moved && this.stateMachine.state === 'Playing'
            && this.isGameplayPointerAllowed(location.x, location.y)) {
            const screenLocation = event.getLocation();
            this.updateAimFromScreenLocation(screenLocation.x, screenLocation.y);
            this.tryFireCarrot();
        }
    }

    private bindWebPointerListeners(): void {
        if (this.webPointerListenersBound || !this.inputController?.supportsPointerControl()) return;
        // Global move/end also receive a drag released over the HUD or outside
        // the gameplay node. Start remains on the node so buttons cannot steer.
        input.on(Input.EventType.TOUCH_MOVE, this.handleGameplayTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.handleGameplayRelease, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.handleGameplayTouchCancel, this);
        input.on(Input.EventType.MOUSE_MOVE, this.handleGameplayMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.handleGameplayMouseRelease, this);
        this.webPointerListenersBound = true;
    }

    private unbindWebPointerListeners(): void {
        if (!this.webPointerListenersBound) return;
        input.off(Input.EventType.TOUCH_MOVE, this.handleGameplayTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.handleGameplayRelease, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.handleGameplayTouchCancel, this);
        input.off(Input.EventType.MOUSE_MOVE, this.handleGameplayMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.handleGameplayMouseRelease, this);
        this.webPointerListenersBound = false;
    }

    private readonly handleOverlayInput = (event: { propagationStopped?: boolean }): void => {
        if (this.hasVisibleOverlay()) event.propagationStopped = true;
    };

    private isGameplayPointerAllowed(uiX: number, uiY: number): boolean {
        if (!this.context) return false;
        const visible = this.visibleSize;
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
                // TODO: console.error('[DoodleJumpGame] Storage flush failed on platform hide.', error);
            }
            return;
        }
        this.persistCurrentRunHistory(false, true);
        if (this.stateMachine.state === 'Playing'
            || this.stateMachine.state === 'ResumeCountdown') {
            this.cancelAttack(true);
            this.context?.requestPause();
        }
    };

    private readonly handlePlatformShow = (): void => {
        if (this.stateMachine.state === 'Playing' && this.inputController?.hasStaleSensor()) {
            this.enterSensorError("返回游戏后未检测到手机倾斜数据");
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
        else if (this.stateMachine.state === 'ResumeCountdown') this.showResumeCountdown();
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

    private refreshVisibleSize(): void {
        const visible = view.getVisibleSize();
        if (this.visibleSize.width === visible.width && this.visibleSize.height === visible.height) return;
        this.visibleSize = new Size(visible.width, visible.height);
    }
}
