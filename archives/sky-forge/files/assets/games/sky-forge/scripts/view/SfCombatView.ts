import { Graphics, Mask, Node, Sprite, SpriteFrame, UIOpacity, Vec4 } from 'cc';
import type { SfCombat } from '../core/SfCombat';
import type { Enemy } from '../core/SfEnemies';
import type { CombatEvent, PickupKind } from '../core/SfTypes';
import { SLOTS, type SlotId } from '../core/SfBalance';
import { PLANE_BY_ID } from '../core/SfPlaneDefs';
import { PLANE_ART, partCenterY } from '../core/SfPlaneArt';
import { Camera2D, SfFx, bankToward, jelly, type SparkColor } from './SfFx';
import { COLORS, color, easeOutCubic, mixHex, node, opacity, size, sprite, texScale, type UiContext } from './SfUi';
import type { Material } from 'cc';
import { SfKitView } from './SfKitView';

interface EnemyView {
    root: Node;
    sprite: Sprite;
    shadow: Sprite;
    shield?: Sprite;
    reticle?: Sprite;
    frame: string;
    seen: boolean;
}

interface Decor { node: Node; y: number; speed: number; h: number; wind?: number }
interface PoolItem { node: Node; sprite: Sprite; op: UIOpacity; frame: string; tint: string }
interface TrailPoint { x: number; y: number; age: number }
interface Flyer { node: Node; t: number; life: number; vx: number; vy: number; spin: number; rot: number }
interface BossWreckBody { node: Node; sprite: Sprite; frame: string; w: number; h: number; scale: number; angle: number }
interface BossWreck { root: Node; bodies: BossWreckBody[]; t: number }

/** 萤火之夜遮罩贴图的显示边长（透光半径随它缩放，保持固定）。 */
const NIGHT_MASK_SIZE = 2400;
const ENTRY_TIME = 0.8;
/** 参考背景在 360 宽画布四周多画 20 像素，覆盖镜头震动与踢动；换算成设计像素。 */
const CAMERA_PADDING = Math.ceil(20 * 750 / 360) + 2;
/** 各章飘云的透明度；0 表示该章不飘云（第 2 章森林树冠贴地飞行，灰白云团压在暗绿地面上像污渍）。 */
const CLOUD_ALPHA: Record<number, number> = { 1: 104, 2: 0, 3: 88, 4: 0, 5: 70, 6: 0 };
const PICKUP_FRAME: Record<PickupKind, string> = {
    main: 'pickup/main', wing: 'pickup/wing', special: 'pickup/special', fire: 'pickup/fire',
    repair: 'pickup/repair', coin: 'pickup/coin', coinBig: 'pickup/coin-big',
};
const SLOT_HEX: Record<SlotId, string> = { main: '#FF6A5A', wing: '#5AB4FF', special: '#6AE07A' };
const BODY_SPARK: Record<string, SparkColor> = { metal: 'metal', wood: 'wood', balloon: 'balloon', flesh: 'flesh' };
const UNIT = 750 / 360;
/** tidal-wings 尾迹参数（采样间隔、点数、下漂速度、寿命），按 750 宽换算。 */
const TRAIL = { interval: 0.026, engineMax: 32, vaporMax: 64, engineFlow: 76 * UNIT, vaporFlow: 72 * UNIT, engineLife: 0.62, vaporLife: 1 };
const SMOKE = ['fx/smoke-0', 'fx/smoke-1', 'fx/smoke-2', 'fx/smoke-3'];
/** 我方子弹拖烟尾的种类（火箭、导弹、炮弹）。 */
const SMOKY = new Set(['rocket', 'missile', 'micro', 'cluster', 'shell', 'shell-big']);
const SPIN = new Set(['star', 'diamond', 'grenade', 'cluster', 'phantom-star', 'voidstar', 'chakram-main', 'chakram-mini', 'chakram-big']);
const ALONG = new Set(['needle', 'chain', 'voidneedle']);
/**
 * 我方弹体的呈现方式（每架飞机不同的材质）。弹体本身（shot/，与敌人同一像素网格）就是主要读数，
 * 不再叠加拉长的曳光光带，保证密集弹幕中依然看得清弹形：
 * - tracer：实弹曳光——曳光尾已画在像素弹体里，不额外加光；
 * - solid：实弹 / 炸弹——不加光，只有尾烟（SMOKY）；
 * - energy：能量弹——弹体下方一圈贴身的淡主色光晕（不超过弹体太多），保留能量质感。
 */
const BULLET_LOOK: Record<string, { look: 'tracer' | 'solid' | 'energy'; tint?: string }> = {
    'vanguard-main': { look: 'tracer', tint: '#7FE6FF' },
    'vanguard-main-2': { look: 'tracer', tint: '#7FE6FF' },
    'vanguard-heavy': { look: 'tracer', tint: '#8FD8FF' },
    'vanguard-wing': { look: 'tracer', tint: '#FFD25A' },
    fneedle: { look: 'tracer', tint: '#FFE27A' },
    'fneedle-2': { look: 'tracer', tint: '#FFE27A' },
    rocket: { look: 'solid' }, missile: { look: 'solid' }, micro: { look: 'solid' },
    shell: { look: 'solid' }, 'shell-big': { look: 'solid' }, grenade: { look: 'solid' }, cluster: { look: 'solid' }, bomblet: { look: 'solid' },
    'lightning-main': { look: 'energy', tint: '#6CE0FF' }, 'lightning-orb': { look: 'energy', tint: '#6CE0FF' },
    'frost-icicle': { look: 'energy', tint: '#9FE8FF' }, 'frost-shard': { look: 'energy', tint: '#9FE8FF' }, 'frost-mist': { look: 'energy', tint: '#9FE8FF' },
    'phantom-bolt': { look: 'energy', tint: '#C77DFF' }, 'phantom-star': { look: 'energy', tint: '#C77DFF' },
    'goose-main': { look: 'tracer', tint: '#B8F0A8' }, 'goose-wing': { look: 'tracer', tint: '#B8F0A8' },
    'goose-dart': { look: 'energy', tint: '#9BE6A8' },
    'blackhole-main': { look: 'energy', tint: '#A070FF' }, 'blackhole-orb': { look: 'energy', tint: '#A070FF' },
    'prism-shard': { look: 'energy', tint: '#9FE8FF' },
    'sword-slash': { look: 'energy', tint: '#8FF4E8' }, 'sword-wave': { look: 'energy', tint: '#8FF4E8' }, 'sword-fall': { look: 'solid' },
    'dragon-breath': { look: 'energy', tint: '#7FE8C0' }, 'dragon-scale': { look: 'energy', tint: '#7FE8C0' }, 'dragon-fire': { look: 'energy', tint: '#F2D060' },
    'chakram-main': { look: 'solid' }, 'chakram-mini': { look: 'solid' }, 'chakram-big': { look: 'solid' },
};

/** 主炮枪口焰颜色（按机体）。 */
const MUZZLE_TINT: Record<string, string> = { vanguard: '#BFF2FF', thunder: '#FFB060', falcon: '#FFF0A0', lightning: '#9AEBFF', frost: '#E2F8FF', phantom: '#E2C6FF', wildgoose: '#E8FFC8', blackhole: '#D8B8FF', swordfish: '#C8FFF4', dragon: '#C8FFE8', chakram: '#FFE8A8' };

/** 战斗画面。只读取 SfCombat 的状态和事件，不改动战斗逻辑。 */
export class SfCombatView {
    readonly root: Node;
    readonly world: Node;
    readonly fx: SfFx;
    readonly camera = new Camera2D();
    /** 顿帧剩余秒数：游戏层据此暂停模拟。 */
    hitstop = 0;
    private readonly sea: Sprite;
    /** 竖向长卷背景（有构图的章节，如第 2 章森林）：多张首尾相接循环滚动，替代平铺地面。 */
    private readonly strips: Sprite[] = [];
    private scrollFrame: SpriteFrame | null = null;
    private seaPadding = CAMERA_PADDING;
    private readonly stripRoot: Node;
    /** 地面层的场地危险物（蛛网、探照光、垂丝、拖网）；激光与藤鞭画在顶层 overlay。 */
    private readonly hazardUnder: Graphics;
    /** 地面危险物贴图（熔岩滩、冰面、冰墙；地面层之上、地面敌人之下），按危险物逐帧复用。 */
    private readonly lavaLayer: Node;
    private readonly lavaSprites: { sprite: Sprite; frame: string }[] = [];
    private readonly groundLayer: Node;
    private readonly groundEnemyLayer: Node;
    private readonly shadowLayer: Node;
    private readonly cloudLayer: Node;
    private readonly pickupLayer: Node;
    private readonly pickupRingLayer: Node;
    private readonly pickupGlowLayer: Node;
    private readonly enemyLayer: Node;
    private readonly trails: Graphics;
    private readonly pbulletLayer: Node;
    private readonly pglowLayer: Node;
    private readonly playerLayer: Node;
    private readonly ebulletLayer: Node;
    private readonly fxRoot: Node;
    private readonly overlay: Graphics;
    private readonly nightMask: Sprite;
    /** 黑白世界（终焉·虚无最终阶段）：盖住背景的亮色底板，敌人与敌弹染成黑色剪影。 */
    private readonly monoMask: Graphics;
    private readonly kitView: SfKitView;
    /** 落雷预警与落雷闪光（关卡规则 storm）。 */
    private readonly strikes: { x: number; t: number; warn: number; hit: boolean }[] = [];
    private readonly flashLayer: Graphics;
    private readonly player: Node;
    private readonly playerBody: Sprite;
    private readonly playerShadow: Sprite;
    private readonly partSprites: Record<SlotId, Sprite[]> = { main: [], wing: [], special: [] };
    private readonly assemblySprites: Sprite[] = [];
    private readonly core: Sprite;
    private readonly enemies = new Map<number, EnemyView>();
    private readonly pbullets: PoolItem[] = [];
    private readonly pglows: PoolItem[] = [];
    private readonly shotKeys = new Map<string, string>();
    private readonly ebullets: PoolItem[] = [];
    private readonly pickups: PoolItem[] = [];
    private readonly pickupRings: PoolItem[] = [];
    private readonly pickupGlows: PoolItem[] = [];
    private readonly decor: Decor[] = [];
    private readonly decorPool: Node[] = [];
    private readonly flyers: Flyer[] = [];
    /** 每个喷口一条发动机尾迹（喷口位置来自 PLANE_ART.nozzles）。 */
    private readonly engineTrails: TrailPoint[][] = [];
    private readonly vaporL: TrailPoint[] = [];
    private readonly vaporR: TrailPoint[] = [];
    private trailClock = 0;
    private bank = 0;
    private playerJelly = 0;
    private scroll = 0;
    private decorTimer = 0.5;
    private cloudTimer = 1;
    private width = 750;
    private height = 1334;
    private scale = 1;
    private time = 0;
    private planeId = 'vanguard';
    private partShown: Record<SlotId, number> = { main: -1, wing: -1, special: -1 };
    private grazeCooldown = 0;
    private smokeClock = 0;
    private decorKeys: string[] = [];
    private chapter = 0;
    private ultimateActors: { node: Node; t: number; life: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    private touching = false;
    private readonly bankPose = new Vec4(0, 0, 0, 1);
    private pendingTimers: { t: number; run: () => void }[] = [];
    private bossWreck?: BossWreck;
    private warningAge = -1;
    private entryTime = ENTRY_TIME;
    private entryStartOffset = 0;
    private entryOffset = 0;
    private entryDt = 0;

    constructor(private readonly ui: UiContext & { bankMaterial?: Material; frames?: Record<string, unknown> }, parent: Node,
        private readonly onBossBlast?: (final: boolean) => void) {
        this.root = node(parent, 'Combat');
        this.sea = sprite(ui, this.root, 'env/ch1-sea', 750, 1334, 0, 0, 'Sea');
        this.sea.type = Sprite.Type.TILED;
        this.stripRoot = node(this.root, 'Scroll');
        this.world = node(this.root, 'World', 750, 1334);
        this.groundLayer = node(this.world, 'Ground');
        this.monoMask = node(this.world, 'MonoMask').addComponent(Graphics);
        this.monoMask.fillColor = color('#E8E8F0');
        this.monoMask.rect(-900, -1500, 1800, 3000);
        this.monoMask.fill();
        this.monoMask.node.active = false;
        this.lavaLayer = node(this.world, 'Lava');
        this.groundEnemyLayer = node(this.world, 'GroundEnemies');
        this.hazardUnder = node(this.world, 'HazardsUnder').addComponent(Graphics);
        this.shadowLayer = node(this.world, 'Shadows');
        this.enemyLayer = node(this.world, 'Enemies');
        // 关卡规则“萤火之夜”：以玩家为中心的透光遮罩，压暗地面与敌机；拾取物、弹幕、玩家与特效在其上方保持可见。
        this.nightMask = sprite(ui, this.world, 'fx/night-mask', NIGHT_MASK_SIZE, NIGHT_MASK_SIZE, 0, 0, 'NightMask');
        this.nightMask.node.active = false;
        this.pickupLayer = node(this.world, 'Pickups');
        this.pickupRingLayer = node(this.pickupLayer, 'PickupRings');
        this.pickupGlowLayer = node(this.pickupLayer, 'PickupGlows');
        this.trails = node(this.world, 'Trails').addComponent(Graphics);
        const kitUnder = node(this.world, 'KitUnder');
        this.pglowLayer = node(this.world, 'PlayerBulletGlows');
        this.pbulletLayer = node(this.world, 'PlayerBullets');
        this.kitView = new SfKitView(ui, kitUnder, node(this.world, 'KitActors'));
        this.playerLayer = node(this.world, 'Player');
        // 薄云位于敌机和玩家上方，敌弹与关键命中特效继续清晰可见。
        this.cloudLayer = node(this.world, 'Clouds');
        this.ebulletLayer = node(this.world, 'EnemyBullets');
        this.fxRoot = node(this.world, 'FxRoot');
        this.overlay = node(this.world, 'Overlay').addComponent(Graphics);
        this.fx = new SfFx(ui, this.fxRoot);
        this.flashLayer = node(this.root, 'Flash').addComponent(Graphics);
        this.playerShadow = sprite(ui, this.shadowLayer, 'plane/vanguard/body', 10, 10, 0, 0, 'PlayerShadow');
        this.playerShadow.color = color('#0B1630', 90);
        this.player = node(this.playerLayer, 'PlayerPlane');
        this.player.addComponent(UIOpacity);
        this.playerBody = sprite(ui, this.player, 'plane/vanguard/body', 10, 10, 0, 0, 'Body');
        for (const slot of SLOTS) {
            for (let i = 0; i < 2; i++) {
                const s = sprite(ui, this.player, 'plane/vanguard/main-1', 10, 10, 0, 0, `${slot}${i}`);
                s.node.active = false;
                this.partSprites[slot].push(s);
            }
        }
        for (let i = 0; i < 12; i++) {
            const s = sprite(ui, this.playerLayer, 'plane/vanguard/main-1', 10, 10, 0, 0, 'Assembly');
            s.node.active = false;
            this.assemblySprites.push(s);
        }
        this.core = sprite(ui, this.player, 'fx/core', 24, 24, 0, 0, 'Core');
        const mat = ui.bankMaterial;
        if (mat) {
            this.playerBody.customMaterial = mat;
            for (const slot of SLOTS) for (const s of this.partSprites[slot]) s.customMaterial = mat;
        }
    }

    // ───────────────────────────── 布局 ─────────────────────────────

    /** Fit Width 下可见宽度恒为 750；安全区高度不足 1180 时整体等比缩小战场。 */
    layout(width: number, height: number, top: number, bottom: number): { scale: number; fieldTop: number; fieldBottom: number; safeTop: number; safeBottom: number } {
        this.width = width; this.height = height;
        const fitWidth = width / 750;
        this.scale = Math.max(0.5, Math.min(1, (top - bottom) / 1180) * fitWidth);
        this.world.setScale(this.scale, this.scale, 1);
        size(this.root, width, height);
        const seaFrame = this.sea.spriteFrame;
        const tileH = seaFrame ? seaFrame.originalSize.height * 2 * this.scale : 512;
        this.seaPadding = Math.max(CAMERA_PADDING, Math.ceil(Math.max(Math.abs(this.camera.x), Math.abs(this.camera.y))) + 2);
        size(this.sea.node, width + this.seaPadding * 2, height + (tileH + this.seaPadding) * 2);
        // 遮罩跟随玩家移动：贴图外围补一圈同色暗框，延伸到屏幕对角线长度，玩家在任何位置时都能盖满整屏。
        const reach = Math.ceil(Math.hypot(width, height) / this.scale);
        const frame = this.nightMask.node.getChildByName('Frame')?.getComponent(Graphics) ?? node(this.nightMask.node, 'Frame').addComponent(Graphics);
        const half = NIGHT_MASK_SIZE / 2;
        frame.clear();
        frame.fillColor = color('#040816', 238);
        frame.rect(-reach, half, reach * 2, reach - half);
        frame.rect(-reach, -reach, reach * 2, reach - half);
        frame.rect(-reach, -half, reach - half, half * 2);
        frame.rect(half, -half, reach - half, half * 2);
        frame.fill();
        return {
            scale: this.scale, fieldTop: height / 2 / this.scale, fieldBottom: -height / 2 / this.scale,
            safeTop: top / this.scale, safeBottom: bottom / this.scale,
        };
    }

    /** 世界坐标 → 战斗根节点坐标（HUD 飘字用，不含震屏）。 */
    toScreen(x: number, y: number): { x: number; y: number } {
        return { x: x * this.scale, y: y * this.scale };
    }

    /** 章节场景：地面 / 海面贴图与卷动装饰（帧名带章节前缀）。 */
    setChapter(chapter: number): void {
        this.chapter = chapter;
        const sea = this.ui.frame(`env/ch${chapter}-sea`);
        if (sea) this.sea.spriteFrame = sea;
        this.scrollFrame = this.ui.frame(`env/ch${chapter}-scroll`) ?? null;
        this.sea.node.active = !this.scrollFrame;
        this.stripRoot.active = !!this.scrollFrame;
        for (const strip of this.strips) strip.spriteFrame = this.scrollFrame;
        const prefix = `env/ch${chapter}-decor-`;
        this.decorKeys = Object.keys(this.ui.frames ?? {}).filter(k => k.indexOf(prefix) === 0);
    }

    reset(c: SfCombat): void {
        this.pendingTimers.length = 0;
        this.bossWreck?.root.destroy(); this.bossWreck = undefined;
        this.strikes.length = 0;
        for (const v of this.enemies.values()) { v.root.destroy(); v.shadow.node.destroy(); }
        this.enemies.clear();
        for (const d of this.decor) { d.node.active = false; this.decorPool.push(d.node); }
        this.decor.length = 0;
        if ((CLOUD_ALPHA[this.chapter] ?? 104) > 0) {
            this.spawnCloud(c, c.bounds.top * 0.45);
            this.spawnCloud(c, c.bounds.bottom * 0.3);
        }
        for (const a of this.ultimateActors) a.node.destroy();
        this.ultimateActors.length = 0;
        for (const f of this.flyers) f.node.destroy();
        this.flyers.length = 0;
        this.engineTrails.length = 0;
        this.vaporL.length = 0;
        this.vaporR.length = 0;
        this.fx.clear();
        this.kitView.clear();
        this.camera.reset();
        this.planeId = c.config.plane;
        this.partShown = { main: -1, wing: -1, special: -1 };
        const frame = this.ui.frame(`plane/${this.planeId}/body`);
        if (frame) {
            this.playerBody.spriteFrame = frame;
            size(this.playerBody.node, frame.originalSize.width, frame.originalSize.height);
            this.playerShadow.spriteFrame = frame;
            size(this.playerShadow.node, frame.originalSize.width * 0.8, frame.originalSize.height * 0.8);
        }
        this.hitstop = 0;
        this.playerJelly = 0;
        this.warningAge = -1;
        this.entryTime = ENTRY_TIME;
        this.entryOffset = this.entryDt = 0;
        for (let i = 0; i < 4; i++) this.spawnDecor(c, c.bounds.bottom + (c.bounds.top - c.bounds.bottom) * (0.15 + i * 0.25));
    }

    /** 续局只做视觉入场，原战斗位置与弹幕状态在动画期间保持不变。 */
    startEntry(c: SfCombat): void {
        if (!c.player.alive || c.phase === 'intro') return;
        this.entryTime = 0;
        this.entryOffset = this.entryStartOffset = c.bounds.bottom - 120 - c.player.y;
    }

    get entering(): boolean { return this.entryTime < ENTRY_TIME; }

    updateEntry(dt: number): void {
        if (!this.entering) return;
        this.entryDt = dt;
        this.entryTime = Math.min(ENTRY_TIME, this.entryTime + dt);
        this.entryOffset = this.entryStartOffset * (1 - easeOutCubic(this.entryTime / ENTRY_TIME));
    }

    setTouching(value: boolean): void { this.touching = value; }

    // ───────────────────────────── 每帧 ─────────────────────────────

    render(c: SfCombat, dt: number, live: boolean): void {
        this.time += dt;
        const simDt = live ? dt * c.timeScale : 0;
        this.camera.update(live ? dt : 0);
        this.world.setPosition(this.camera.x, this.camera.y);
        this.scroll += c.scrollSpeed * simDt;
        const tileH = (this.sea.spriteFrame?.originalSize.height ?? 256) * 2 * this.scale;
        // 背景与世界共用镜头位移。若未来效果超过参考余量，扩展平铺范围，始终盖住屏幕边缘。
        const padding = Math.ceil(Math.max(Math.abs(this.camera.x), Math.abs(this.camera.y))) + 2;
        if (padding > this.seaPadding) {
            this.seaPadding = padding;
            size(this.sea.node, this.width + padding * 2, this.height + (tileH + padding) * 2);
        }
        this.sea.node.setPosition(this.camera.x, -((this.scroll * this.scale) % tileH) + tileH / 2 + this.camera.y);
        if (this.scrollFrame) this.renderStrips(padding);
        this.updateDecor(c, simDt);
        this.renderEnemies(c);
        this.playerLayer.setPosition(0, this.entryOffset);
        this.trails.node.setPosition(0, this.entryOffset);
        this.renderPlayerBullets(c, simDt);
        this.renderEnemyBullets(c);
        this.renderPickups(c);
        this.kitView.render(c.player.alive ? c.kit.visual : undefined, this.planeId, this.time);
        this.renderPlayer(c, simDt);
        this.renderTrails(c, this.entryDt || simDt);
        this.entryDt = 0;
        this.renderBossWreck(live ? dt : 0);
        this.renderFlyers(live ? dt : 0);
        this.renderOverlay(c, live ? dt : 0);
        this.renderUltimateActors(live ? dt : 0);
        this.renderFlash();
        this.fx.update(live ? dt : 0);
        if (this.grazeCooldown > 0) this.grazeCooldown -= dt;
    }

    private pool(pool: PoolItem[], layer: Node, count: number): void {
        while (pool.length < count) {
            const s = sprite(this.ui, layer, 'bullet/orb-s', 10, 10, 0, 0, 'B');
            pool.push({ node: s.node, sprite: s, op: s.node.addComponent(UIOpacity), frame: '', tint: '' });
        }
        for (let i = count; i < pool.length; i++) if (pool[i].node.active) pool[i].node.active = false;
    }

    private apply(item: PoolItem, key: string, x: number, y: number, angle: number, sx: number, sy: number, alpha = 255, tint = '#FFFFFF'): void {
        if (!item.node.active) item.node.active = true;
        if (item.frame !== key) {
            const f = this.ui.frame(key) ?? this.ui.frame('bullet/orb-s');
            if (f) {
                item.sprite.spriteFrame = f;
                const k = this.ui.frame(key) ? texScale(key) : texScale('bullet/orb-s');
                size(item.node, f.originalSize.width * k, f.originalSize.height * k);
            }
            item.frame = key;
        }
        if (item.tint !== tint) { item.sprite.color = color(tint); item.tint = tint; }
        item.node.setPosition(x, y);
        item.node.setRotationFromEuler(0, 0, angle * 180 / Math.PI);
        item.node.setScale(sx, sy, 1);
        if (item.op.opacity !== alpha) item.op.opacity = alpha;
    }

    /** 我方像素弹体在 shot/；冰雾等柔和弹体仍在 bullet/。 */
    private shotKey(kind: string): string {
        let key = this.shotKeys.get(kind);
        if (key) return key;
        key = this.ui.frame(`shot/${kind}`) ? `shot/${kind}` : `bullet/${kind}`;
        if (this.ui.frame(key)) this.shotKeys.set(kind, key);
        return key;
    }

    private renderPlayerBullets(c: SfCombat, simDt: number): void {
        const list = c.pbullets;
        this.pool(this.pbullets, this.pbulletLayer, list.length);
        this.pool(this.pglows, this.pglowLayer, list.length);
        this.smokeClock -= simDt;
        const puff = this.smokeClock <= 0 && simDt > 0;
        if (puff) this.smokeClock = 0.05;
        let puffs = 0;
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const angle = (b.angle ?? Math.atan2(b.vy, b.vx)) - Math.PI / 2;
            if (b.kind === 'phantom') {
                this.apply(this.pbullets[i], `plane/${this.planeId}/body`, b.x, b.y, Math.PI, 1.15, 1.15, 165, '#8FF4FF');
                this.apply(this.pglows[i], 'fx/glow', b.x, b.y, 0, 2.6, 2.6, 120, '#8FF4FF');
                continue;
            }
            const rot = SPIN.has(b.kind) ? this.time * 9 : angle;
            const s = b.scale ?? 1;
            this.apply(this.pbullets[i], this.shotKey(b.kind), b.x, b.y, rot, s, s);
            const look = BULLET_LOOK[b.kind] ?? { look: 'energy' as const, tint: '#FFFFFF' };
            if (look.look === 'energy') {
                const flicker = 0.9 + Math.sin(this.time * 40 + b.id) * 0.1;
                this.apply(this.pglows[i], 'fx/glow', b.x, b.y, angle, 0.55 * s * flicker, 0.8 * s * flicker, 80, look.tint ?? '#FFFFFF');
            } else if (this.pglows[i].node.active) {
                this.pglows[i].node.active = false;
            }
            if (puff && SMOKY.has(b.kind) && puffs < 14) {
                puffs++;
                this.fx.spawn(SMOKE[0], b.x - b.vx * 0.02, b.y - b.vy * 0.02, { frames: SMOKE, life: 0.42, w: 16, h: 16, scale: 0.7, scaleEnd: 1.4, fade: true, alpha: 0.55 });
            }
        }
    }

    private renderEnemyBullets(c: SfCombat): void {
        const list = c.ebullets;
        this.pool(this.ebullets, this.ebulletLayer, list.length);
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const pre = b.delay > 0;
            const blink = pre && Math.floor(this.time * 20) % 2 === 0;
            let angle = 0;
            if (ALONG.has(b.kind)) angle = b.angle - Math.PI / 2;
            else if (SPIN.has(b.kind)) angle = this.time * (b.id % 2 ? 6 : -6);
            // 敌弹呼吸：外圈光晕轻微脉动，让弹幕更醒目。
            const pulse = 1 + Math.sin(this.time * 12 + b.id) * 0.07;
            const grow = pre ? 0.6 + 0.4 * Math.max(0, Math.min(1, 1 - b.delay * 2)) : 1;
            this.apply(this.ebullets[i], `bullet/${b.kind}`, b.x, b.y, angle, pulse * grow, pulse * grow, blink ? 120 : 255, c.monochrome ? '#141418' : '#FFFFFF');
        }
    }

    private renderPickups(c: SfCombat): void {
        const list = c.pickups;
        this.pool(this.pickupRings, this.pickupRingLayer, list.length);
        this.pool(this.pickupGlows, this.pickupGlowLayer, list.length);
        this.pool(this.pickups, this.pickupLayer, list.length);
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            const bob = Math.sin((this.time + p.id) * 5) * 4;
            const blink = !p.lost && p.age > p.life - 2 && !p.magnet;
            const alpha = blink && Math.floor(this.time * 12) % 2 === 0 ? 70 : 255;
            const slot = p.kind === 'main' || p.kind === 'wing' || p.kind === 'special' ? p.kind as SlotId : undefined;
            const glowTint = slot ? SLOT_HEX[slot] : p.kind === 'fire' ? '#FFB43C' : p.kind === 'repair' ? '#7BF08A' : '#FFD45C';
            const gs = 1 + Math.sin(this.time * 6 + p.id) * 0.12;
            const ring = ((this.time + p.id * 0.13) % 0.9) / 0.9, rs = 0.6 + ring * 0.6;
            this.apply(this.pickupRings[i], 'fx/ring', p.x, p.y + bob, 0, rs, rs, Math.round(alpha * 0.7 * (1 - ring)), glowTint);
            this.apply(this.pickupGlows[i], 'fx/glow', p.x, p.y + bob, 0, gs * 2.2, gs * 2.2, Math.round(alpha / 255 * (150 + Math.sin(this.time * 6 + p.id) * 25)), glowTint);
            if (p.lost && slot && p.level) {
                // 被击落的零件：显示真实零件图，翻滚提示可以捡回。
                this.apply(this.pickups[i], `plane/${this.planeId}/${slot}-${p.level}`, p.x, p.y + bob, this.time * 4 + p.id, 1.1, 1.1, alpha);
            } else {
                const s = (slot ? 1.35 : p.kind === 'fire' || p.kind === 'repair' ? 1.1 : 1.4) * (1 + Math.sin(this.time * 8 + p.id) * 0.06);
                this.apply(this.pickups[i], PICKUP_FRAME[p.kind], p.x, p.y + bob, 0, s, s, alpha);
            }
        }
    }

    private renderEnemies(c: SfCombat): void {
        for (const v of this.enemies.values()) v.seen = false;
        for (const e of c.enemies) {
            if (e.dead) continue;
            let v = this.enemies.get(e.id);
            if (!v) v = this.createEnemy(e);
            v.seen = true;
            if (v.frame !== e.frame) {
                const f = this.ui.frame(e.frame);
                if (f) {
                    v.sprite.spriteFrame = f;
                    size(v.sprite.node, f.originalSize.width * 2, f.originalSize.height * 2);
                    v.shadow.spriteFrame = f;
                    size(v.shadow.node, f.originalSize.width * 2, f.originalSize.height * 2);
                }
                v.frame = e.frame;
            }
            // tidal-wings 受击：果冻形变 + 向上踢动，不闪白。
            const j = jelly(e.jelly, e.jellyMax, e.jellyStrength, !!e.boss);
            v.root.setPosition(e.x, e.y + j.offsetY + e.kickY);
            // scale 的符号只表示左右镜像，大小等比作用在两个轴上（弹跳、抛射等的“高度感”）。
            v.root.setScale(j.x * e.scale, j.y * Math.abs(e.scale), 1);
            v.root.setRotationFromEuler(0, 0, e.angle * 180 / Math.PI);
            const warn = e.windup > 0 && Math.floor(this.time * 16) % 2 === 0;
            // tint：'ghost' 为幽灵半透明青；'#RRGGBB' 为隐藏 Boss 等换色；alpha 为潜航等透明度。
            const hexTint = e.tint && e.tint[0] === '#' ? e.tint : undefined;
            // 寒冰冻结：整体染冰蓝。
            const frozen = (e.data.frozenUntil ?? 0) > c.time;
            const tint = c.monochrome ? (warn ? '#802040' : '#18181E')
                : e.tint === 'ghost' ? (warn ? '#FFB0D0' : '#9CFFE0') : warn ? '#FFB0B0' : e.wreck && !e.boss && !e.decor ? '#6A6A80' : frozen ? '#9FE8FF' : hexTint ?? '#FFFFFF';
            v.sprite.color = color(tint, (e.tint === 'ghost' ? 215 : 255) * (e.alpha ?? 1));
            if (!e.def.ground && !e.parent) {
                v.shadow.node.active = true;
                v.shadow.node.setPosition(e.x + 26, e.y - 34);
                v.shadow.node.setScale(e.scale * 0.8, Math.abs(e.scale) * 0.8, 1);
                v.shadow.node.setRotationFromEuler(0, 0, e.angle * 180 / Math.PI);
            } else v.shadow.node.active = false;
            if (e.shield !== undefined) {
                if (!v.shield) v.shield = sprite(this.ui, v.root, 'fx/shield', e.radius * 2.8, e.radius * 2.8, 0, 0, 'Shield');
                v.shield.node.active = e.shield > 0;
                opacity(v.shield.node, 160 + Math.sin(this.time * 9) * 60);
            }
            if (e.locks > 0) {
                if (!v.reticle) v.reticle = sprite(this.ui, v.root, 'fx/reticle', 64, 64, 0, 0, 'Reticle');
                v.reticle.node.active = true;
                v.reticle.node.setRotationFromEuler(0, 0, -this.time * 180 - e.angle * 180 / Math.PI);
                const s = (e.radius * 2.2) / 64 / Math.abs(e.scale);
                v.reticle.node.setScale(s, s, 1);
            } else if (v.reticle) v.reticle.node.active = false;
        }
        for (const [id, v] of Array.from(this.enemies.entries())) {
            if (!v.seen) {
                v.root.destroy();
                v.shadow.node.destroy();
                this.enemies.delete(id);
            }
        }
    }

    private createEnemy(e: Enemy): EnemyView {
        const layer = e.def.ground ? this.groundEnemyLayer : this.enemyLayer;
        const root = node(layer, e.def.id, 10, 10);
        // frame 为空字符串：不可见的受击区（如驱逐舰炮塔，画在船体图里），只显示血条。
        const f = e.frame ? this.ui.frame(e.frame) : undefined;
        const w = f ? f.originalSize.width * 2 : e.radius * 2;
        const h = f ? f.originalSize.height * 2 : e.radius * 2;
        const s = sprite(this.ui, root, e.frame, w, h, 0, 0, 'Body');
        if (!e.frame) s.node.active = false;
        const shadow = sprite(this.ui, this.shadowLayer, e.frame, w, h, 0, 0, 'Shadow');
        shadow.color = color('#0B1630', 80);
        shadow.node.active = false;
        if (e.boss) root.setSiblingIndex(0);
        const v: EnemyView = { root, sprite: s, shadow, frame: e.frame, seen: true };
        this.enemies.set(e.id, v);
        return v;
    }

    /** 挂点位置（含侧偏仿射变换，保证组装 / 解体动画落点贴合倾斜后的机身）。 */
    private mountPos(slot: SlotId, side: number): { x: number; y: number } {
        const m = PLANE_ART[this.planeId]?.[slot] ?? [20, 0];
        const roll = this.bank;
        const lx = m[0] * side, ly = m[1];
        return { x: lx * (1 - Math.abs(roll) * 0.28), y: ly * (1 + Math.abs(roll) * 0.035) + lx * roll * 0.14 };
    }

    private renderPlayer(c: SfCombat, simDt: number): void {
        const p = c.player;
        this.player.active = p.alive || c.phase === 'exit';
        this.playerShadow.node.active = this.player.active;
        if (simDt > 0) this.bank = bankToward(this.bank, p.vx, 760, simDt);
        this.playerJelly = Math.max(0, this.playerJelly - simDt);
        const j = jelly(this.playerJelly, 0.24, 1);
        this.player.setScale(j.x, j.y, 1);
        this.player.setPosition(p.x, p.y + j.offsetY * 2);
        this.playerShadow.node.setPosition(p.x + 34, p.y - 46 + this.entryOffset);
        this.playerShadow.node.setScale(1 - Math.abs(this.bank) * 0.2, 1, 1);
        const wp = this.player.worldPosition;
        this.bankPose.set(wp.x, wp.y, this.bank, 1);
        this.ui.bankMaterial?.setProperty('bankPose', this.bankPose);
        const blink = p.invulnerable > 0 && this.playerJelly <= 0 && Math.floor(this.time * 12) % 2 === 0;
        opacity(this.player, blink ? 0 : 255);
        for (const slot of SLOTS) {
            const level = c.fieldParts[slot];
            if (level === this.partShown[slot]) continue;
            this.partShown[slot] = level;
            const art = PLANE_ART[this.planeId];
            const m = art?.[slot] ?? [20, 0];
            const under = art?.fit[slot][1] ?? false;
            this.partSprites[slot].forEach((s, i) => {
                const side = i === 0 ? -1 : 1;
                const f = level > 0 ? this.ui.frame(`plane/${this.planeId}/${slot}-${level}`) : undefined;
                if (!f) { s.node.active = false; return; }
                s.spriteFrame = f;
                size(s.node, f.originalSize.width, f.originalSize.height);
                s.node.active = true;
                // 零件挂法：后半截压在机体下层（或叠在上层），前缘锚点之前伸出 protrude 比例。
                s.node.setPosition(m[0] * side, partCenterY(this.planeId, slot, f.originalSize.height));
                s.node.setScale(side < 0 ? -1 : 1, 1, 1);
                s.node.setSiblingIndex(under ? 0 : this.player.children.length - 1);
            });
            this.core.node.setSiblingIndex(this.player.children.length - 1);
        }
        // 组装：真实零件图从拾取点沿弧线翻转飞向左右两个挂点，到位时缩回原尺寸。
        let used = 0;
        const counts: Record<SlotId, number> = { main: 0, wing: 0, special: 0 };
        for (const a of c.assemblies) {
            counts[a.slot]++;
            const level = Math.min(3, c.fieldParts[a.slot] + counts[a.slot]);
            const f = this.ui.frame(`plane/${this.planeId}/${a.slot}-${level}`);
            const k = Math.min(1, a.t / a.duration);
            const ease = k * k * (3 - 2 * k);
            for (const side of [-1, 1]) {
                const s = this.assemblySprites[used++];
                if (!s || !f) continue;
                const m = this.mountPos(a.slot, side);
                const x = a.fromX + (p.x + m.x - a.fromX) * ease + side * Math.sin(k * Math.PI) * 60;
                const y = a.fromY + (p.y + m.y - a.fromY) * ease + Math.sin(k * Math.PI) * 50;
                if (s.spriteFrame !== f) { s.spriteFrame = f; size(s.node, f.originalSize.width, f.originalSize.height); }
                s.node.active = true;
                s.node.setPosition(x, y);
                const sc = 2.2 - 1.2 * ease;
                s.node.setScale(sc * (side < 0 ? -1 : 1), sc, 1);
                s.node.setRotationFromEuler(0, 0, (1 - ease) * 540 * side);
            }
        }
        for (let i = used; i < this.assemblySprites.length; i++) this.assemblySprites[i].node.active = false;
        this.core.node.active = this.touching && p.alive && c.phase !== 'exit';
        if (this.core.node.active) {
            const pulse = 1 + Math.sin(this.time * 14) * 0.12;
            this.core.node.setScale(pulse, pulse, 1);
        }
    }

    /** 尾迹：发动机流 + 两侧翼尖水汽，采样点向下漂移并淡出（tidal-wings 参数）。 */
    private renderTrails(c: SfCombat, simDt: number): void {
        const p = c.player;
        const art = PLANE_ART[this.planeId];
        if (simDt > 0) {
            for (const trail of this.engineTrails) for (const pt of trail) { pt.age += simDt; pt.y -= TRAIL.engineFlow * simDt; }
            for (const pt of this.vaporL) { pt.age += simDt; pt.y -= TRAIL.vaporFlow * simDt; }
            for (const pt of this.vaporR) { pt.age += simDt; pt.y -= TRAIL.vaporFlow * simDt; }
            this.trailClock -= simDt;
            if (this.trailClock <= 0 && art && (p.alive || c.phase === 'exit')) {
                this.trailClock = TRAIL.interval;
                const w = art.size[0], h = art.size[1];
                const tip = (side: number) => {
                    const lx = side * w * 0.44, ly = -h * 0.12;
                    return { x: p.x + lx * (1 - Math.abs(this.bank) * 0.28), y: p.y + ly + lx * this.bank * 0.14 };
                };
                // 喷口随侧倾做与机身相同的仿射变换，尾迹从喷口末端拖出。
                art.nozzles.forEach(([nx, ny], i) => {
                    if (!this.engineTrails[i]) this.engineTrails[i] = [];
                    this.engineTrails[i].push({ x: p.x + nx * (1 - Math.abs(this.bank) * 0.28), y: p.y + ny + nx * this.bank * 0.14, age: 0 });
                });
                const l = tip(-1), r = tip(1);
                this.vaporL.push({ x: l.x, y: l.y, age: 0 });
                this.vaporR.push({ x: r.x, y: r.y, age: 0 });
            }
            for (const trail of this.engineTrails) trim(trail, TRAIL.engineMax, TRAIL.engineLife);
            trim(this.vaporL, TRAIL.vaporMax, TRAIL.vaporLife);
            trim(this.vaporR, TRAIL.vaporMax, TRAIL.vaporLife);
        }
        const g = this.trails;
        g.clear();
        const tone = PLANE_BY_ID[this.planeId as keyof typeof PLANE_BY_ID]?.color ?? COLORS.foam;
        const wide = this.engineTrails.length > 1 ? 9 : 12;
        for (const trail of this.engineTrails) {
            this.strokeTrail(g, trail, TRAIL.engineLife, tone, wide, 130);
            this.strokeTrail(g, trail, TRAIL.engineLife, '#FFFFFF', 3, 170);
        }
        this.strokeTrail(g, this.vaporL, TRAIL.vaporLife, '#FFFFFF', 3, 120);
        this.strokeTrail(g, this.vaporR, TRAIL.vaporLife, '#FFFFFF', 3, 120);
    }

    private strokeTrail(g: Graphics, pts: TrailPoint[], life: number, hex: string, width: number, alpha: number): void {
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            if (Math.hypot(b.x - a.x, b.y - a.y) > 72) continue;
            const k = Math.max(0, 1 - b.age / life);
            g.strokeColor = color(hex, alpha * k * k);
            g.lineWidth = Math.max(1, width * (0.3 + 0.7 * k));
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
        }
    }

    private renderFlyers(dt: number): void {
        for (let i = this.flyers.length - 1; i >= 0; i--) {
            const f = this.flyers[i];
            f.t += dt;
            f.vy -= 420 * dt;
            f.node.setPosition(f.node.position.x + f.vx * dt, f.node.position.y + f.vy * dt);
            f.rot += f.spin * dt;
            f.node.setRotationFromEuler(0, 0, f.rot);
            opacity(f.node, 255 * Math.max(0, 1 - f.t / f.life));
            if (dt > 0 && Math.random() < 0.5) {
                this.fx.spawn(SMOKE[0], f.node.position.x, f.node.position.y, { frames: SMOKE, life: 0.4, w: 20, h: 20, scaleEnd: 1.5, fade: true, alpha: 0.6 });
            }
            if (f.t >= f.life) { f.node.destroy(); this.flyers.splice(i, 1); }
        }
    }

    private renderOverlay(c: SfCombat, dt: number): void {
        const g = this.overlay;
        g.clear();
        this.renderBeams(c);
        this.renderHazards(c);
        this.monoMask.node.active = c.monochrome;
        this.renderStrikes(c, dt);
        this.nightMask.node.active = c.level.rule === 'night' && c.phase !== 'clear' && c.phase !== 'exit' && c.phase !== 'done';
        if (this.nightMask.node.active) this.nightMask.node.setPosition(c.player.x, c.player.y + this.entryOffset);
        for (const e of c.enemies) {
            if (e.dead) continue;
            if (e.aimX !== 0 || e.aimY !== 0) {
                const blink = Math.floor(this.time * 18) % 2 === 0;
                g.strokeColor = color(blink ? '#FF3A5A' : '#FFD0D8', 220);
                g.lineWidth = 4;
                for (let d = 30; d < 1300; d += 36) {
                    g.moveTo(e.x + e.aimX * d, e.y + e.aimY * d);
                    g.lineTo(e.x + e.aimX * (d + 20), e.y + e.aimY * (d + 20));
                }
                g.stroke();
            }
            // 所有敌人（含小飞机）都显示血条；Boss 本体用顶部大血条。
            if (!e.boss && !e.wreck && !e.base && e.entered) {
                const big = e.def.size === 'elite' || e.def.size === 'part' || e.def.size === 'large';
                const w = Math.max(40, Math.min(140, e.radius * 1.5)), h = big ? 7 : 5;
                const x = e.x - w / 2, y = e.y + e.radius * 0.85 + 12;
                const ratio = Math.max(0, e.hp / e.maxHp);
                g.fillColor = color(COLORS.ink, 220);
                g.rect(x - 2, y - 2, w + 4, h + 4);
                g.fill();
                g.fillColor = color(ratio > 0.5 ? '#6BE07A' : ratio > 0.25 ? '#FFC23A' : '#FF4A5E');
                g.rect(x, y, Math.max(1, w * ratio), h);
                g.fill();
                g.fillColor = color('#FFFFFF', 110);
                g.rect(x, y + h - 1, Math.max(1, w * ratio), 1);
                g.fill();
            }
        }
        // Boss 预警期间屏幕两侧的红色警示边（tidal-wings renderBossEntry）。
        if (this.warningAge >= 0 && this.warningAge < 3) {
            this.warningAge += dt;
            const a = Math.min(1, this.warningAge / 0.12) * (0.68 + 0.32 * Math.pow(Math.sin(this.warningAge * Math.PI * 5), 2));
            const h = c.bounds.top - c.bounds.bottom;
            g.fillColor = color('#E56B54', 110 * a);
            g.rect(c.bounds.left - 60, c.bounds.bottom + h * 0.5, 70, h * 0.45);
            g.rect(c.bounds.right - 10, c.bounds.bottom + h * 0.5, 70, h * 0.45);
            g.fill();
        }
    }

    /** 第 i 块地面危险物贴图（不足时补建，按需切换贴图帧）。 */
    private lavaSprite(i: number, frame: string): Sprite {
        let item = this.lavaSprites[i];
        if (!item) {
            item = { sprite: sprite(this.ui, this.lavaLayer, frame, 10, 10, 0, 0, 'GroundHazard'), frame };
            this.lavaSprites.push(item);
        }
        if (item.frame !== frame) {
            const f = this.ui.frame(frame);
            if (f) item.sprite.spriteFrame = f;
            item.frame = frame;
        }
        item.sprite.node.active = true;
        return item.sprite;
    }

    /** 场地危险物与护盾无人机的护罩（见 SfTypes.Hazard）。 */
    private renderHazards(c: SfCombat): void {
        const top = this.overlay, under = this.hazardUnder;
        under.clear();
        const t = this.time;
        let lavaUsed = 0;
        const groundSprite = (frame: string, x: number, y: number, w: number, h: number, angle: number, alpha: number): void => {
            const sp = this.lavaSprite(lavaUsed++, frame);
            size(sp.node, w, h);
            sp.node.setPosition(x, y);
            sp.node.angle = angle;
            opacity(sp.node, alpha);
        };
        for (const h of c.hazards) {
            const fade = h.life !== undefined && h.maxLife ? Math.min(1, h.life / Math.min(0.4, h.maxLife)) : 1;
            const warn = (h.warn ?? 0) > 0;
            const blink = Math.floor(t * 18) % 2 === 0;
            switch (h.kind) {
                case 'path': {
                    // 飞行路线：红色虚线，预告阶段由淡到实并闪烁，俯冲开始后只剩前方路段。
                    const k = warn ? 1 - (h.warn ?? 0) : 1;
                    const alpha = warn ? (130 + 125 * k) * (blink ? 1 : 0.7) : 170;
                    const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                    under.strokeColor = color('#FF4A3A', alpha);
                    under.lineWidth = h.width;
                    for (let d = 0; d < len; d += 28) {
                        const e = Math.min(len, d + 18);
                        under.moveTo(h.ax + dx * d / len, h.ay + dy * d / len);
                        under.lineTo(h.ax + dx * e / len, h.ay + dy * e / len);
                    }
                    under.stroke();
                    break;
                }
                case 'web': {
                    const r = h.width, a = 150 * fade;
                    under.fillColor = color('#E8E4FF', 36 * fade);
                    under.circle(h.ax, h.ay, r);
                    under.fill();
                    under.strokeColor = color('#F2EEFF', a);
                    under.lineWidth = 2;
                    for (let i = 0; i < 8; i++) {
                        const ang = i * Math.PI / 4 + 0.2;
                        under.moveTo(h.ax, h.ay);
                        under.lineTo(h.ax + Math.cos(ang) * r, h.ay + Math.sin(ang) * r);
                    }
                    for (const k of [0.35, 0.65, 0.95]) under.circle(h.ax, h.ay, r * k);
                    under.stroke();
                    break;
                }
                case 'lava': {
                    if (warn) {
                        // 预警：闪烁的橙色虚线圈，越接近生效越实。
                        const k = 1 - (h.warn ?? 0);
                        under.fillColor = color('#FF6A1A', 30 + 50 * k);
                        under.circle(h.ax, h.ay, h.width);
                        under.fill();
                        under.strokeColor = color('#FFB040', (blink ? 230 : 130) * (0.5 + k * 0.5));
                        under.lineWidth = 3;
                        dashedCircle(under, h.ax, h.ay, h.width, 14);
                        under.stroke();
                        break;
                    }
                    const pulse = 1 + Math.sin(t * 5 + h.ax * 0.03) * 0.04;
                    const grow = h.maxLife ? Math.min(1, (h.maxLife - (h.life ?? 0)) / 0.18) : 1;
                    const d = h.width * 2.2 * pulse * (0.6 + 0.4 * grow);
                    groundSprite('enemy/lavapool', h.ax, h.ay, d, d * 0.73, (h.ax * 7 + h.ay * 3) % 360, 255 * fade);
                    break;
                }
                case 'ice': {
                    const grow = h.maxLife ? Math.min(1, (h.maxLife - (h.life ?? 0)) / 0.2) : 1;
                    const d = h.width * 2.1 * (0.5 + 0.5 * grow);
                    groundSprite('enemy/icefloor', h.ax, h.ay, d, d * 0.7, (h.ax * 5 + h.ay * 2) % 360, 235 * fade);
                    break;
                }
                case 'icewall': {
                    // 冰墙贴图沿线段拉伸；预警期间半透明闪烁（正在凝结）。
                    const len = Math.hypot(h.bx - h.ax, h.by - h.ay);
                    const angle = Math.atan2(h.by - h.ay, h.bx - h.ax) * 180 / Math.PI;
                    const a = warn ? (blink ? 150 : 80) * (1 - (h.warn ?? 0) * 0.6) : 255 * fade;
                    groundSprite('enemy/icewall', (h.ax + h.bx) / 2, (h.ay + h.by) / 2, len + 20, Math.max(28, h.width * 3.2), angle, a);
                    break;
                }
                case 'mark': {
                    // 落点阴影：暗色实心圈逐渐变浓，外圈闪烁。
                    const k = 1 - (h.warn ?? 0);
                    under.fillColor = h.tint ? color(h.tint, 30 + 70 * k) : color('#140A06', 50 + 90 * k);
                    under.circle(h.ax, h.ay, h.width * (0.55 + 0.45 * k));
                    under.fill();
                    under.strokeColor = color(h.tint ?? '#FF7A2A', blink ? 220 : 120);
                    under.lineWidth = 2;
                    under.circle(h.ax, h.ay, h.width);
                    under.stroke();
                    break;
                }
                case 'rail': {
                    // 矿车轨道：两条钢轨 + 枕木；预警期间轨道发橙光闪烁。
                    const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
                    if (warn) {
                        under.strokeColor = color('#FF8A2A', (blink ? 150 : 70) * fade);
                        under.lineWidth = 34;
                        under.moveTo(h.ax, h.ay); under.lineTo(h.bx, h.by);
                        under.stroke();
                    }
                    under.strokeColor = color('#3A2A22', 230 * fade);
                    under.lineWidth = 6;
                    for (let d = 0; d < len; d += 22) {
                        const x = h.ax + ux * d, y = h.ay + uy * d;
                        under.moveTo(x + nx * 15, y + ny * 15); under.lineTo(x - nx * 15, y - ny * 15);
                    }
                    under.stroke();
                    under.strokeColor = color('#B8B0A8', 240 * fade);
                    under.lineWidth = 3;
                    for (const off of [-10, 10]) {
                        under.moveTo(h.ax + nx * off, h.ay + ny * off); under.lineTo(h.bx + nx * off, h.by + ny * off);
                    }
                    under.stroke();
                    break;
                }
                case 'fissure': {
                    const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                    if (warn) {
                        top.strokeColor = color('#FF5A2A', (blink ? 230 : 110) * (1 - (h.warn ?? 0) * 0.5));
                        top.lineWidth = 2;
                        top.moveTo(h.ax, h.ay); top.lineTo(h.bx, h.by);
                        top.stroke();
                        break;
                    }
                    // 锯齿裂缝：沿线段交错偏移的折线，暗红外缘 → 橙 → 黄白芯。
                    const nx = -dy / len, ny = dx / len;
                    const pts: { x: number; y: number }[] = [];
                    const seed = Math.abs(Math.round(h.ax * 13 + h.by * 7));
                    for (let d = 0, i = 0; d <= len; d += 26, i++) {
                        const off = d === 0 || d + 26 > len ? 0 : (((seed + i * 37) % 9) - 4) * 2.2;
                        pts.push({ x: h.ax + dx / len * d + nx * off, y: h.ay + dy / len * d + ny * off });
                    }
                    pts.push({ x: h.bx, y: h.by });
                    const layers: [string, number, number][] = [['#5A0E06', 2.6, 220], ['#FF4A12', 1.6, 240], ['#FFD25A', 0.6, 255]];
                    for (const [hex, k, a] of layers) {
                        under.strokeColor = color(hex, a * fade);
                        under.lineWidth = Math.max(2, h.width * k * (1 + Math.sin(t * 20) * 0.05));
                        under.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) under.lineTo(pts[i].x, pts[i].y);
                        under.stroke();
                    }
                    break;
                }
                case 'tongue': {
                    if (warn) {
                        top.strokeColor = color('#FF5A7A', (blink ? 220 : 110));
                        top.lineWidth = 2;
                        top.moveTo(h.ax, h.ay); top.lineTo(h.bx, h.by);
                        top.stroke();
                        break;
                    }
                    for (const [hex, k] of [['#5A1020', 2.4], ['#E0506A', 1.8], ['#FF9AAE', 0.7]] as [string, number][]) {
                        top.strokeColor = color(hex, 255 * fade);
                        top.lineWidth = h.width * k;
                        top.moveTo(h.ax, h.ay); top.lineTo(h.bx, h.by);
                        top.stroke();
                    }
                    top.fillColor = color('#E0506A', 255 * fade);
                    top.circle(h.bx, h.by, h.width * 1.6);
                    top.fill();
                    break;
                }
                case 'pulse': {
                    // 环形脉冲波：酸绿外晕 + 亮芯，缺口处断开；预警期间是闪烁的细虚线圈。
                    const r = h.radius ?? 0, gap = h.gap ?? 0, gw = h.gapWidth ?? 0;
                    const a0 = gap + gw, a1 = gap + Math.PI * 2 - gw;
                    if (warn) {
                        top.strokeColor = color('#B8FF5A', blink ? 200 : 90);
                        top.lineWidth = 2;
                        dashedCircle(top, h.ax, h.ay, r, 18);
                        top.stroke();
                        break;
                    }
                    for (const [hex, k, a] of [['#3FCF1A', 2.8, 90], ['#B8FF5A', 1.4, 230], ['#FFFFFF', 0.45, 255]] as [string, number, number][]) {
                        top.strokeColor = color(hex, a * fade);
                        top.lineWidth = Math.max(2, h.width * k);
                        top.moveTo(h.ax + Math.cos(a0) * r, h.ay + Math.sin(a0) * r);
                        top.arc(h.ax, h.ay, r, a0, a1, true);
                        top.stroke();
                    }
                    break;
                }
                case 'tractor': {
                    // 牵引光束：从光源向外张开的半透明光锥，光环沿光束向光源移动。
                    const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
                    const w0 = h.width * 0.35, w1 = h.width;
                    under.fillColor = color('#B8FF5A', 34 * fade);
                    under.moveTo(h.ax + nx * w0, h.ay + ny * w0); under.lineTo(h.bx + nx * w1, h.by + ny * w1);
                    under.lineTo(h.bx - nx * w1, h.by - ny * w1); under.lineTo(h.ax - nx * w0, h.ay - ny * w0); under.close();
                    under.fill();
                    under.strokeColor = color('#D8FF9A', 150 * fade);
                    under.lineWidth = 3;
                    for (let k = 0; k < 6; k++) {
                        const u = 1 - ((t * 0.9 + k / 6) % 1);
                        const w = w0 + (w1 - w0) * u, x = h.ax + dx * u, y = h.ay + dy * u;
                        under.moveTo(x + nx * w, y + ny * w); under.lineTo(x - nx * w, y - ny * w);
                    }
                    under.stroke();
                    break;
                }
                case 'portal': {
                    // 虚空裂缝：两端画裂缝贴图，中间一条缓慢流动的虚线表示相连；预警期间半透明闪烁。
                    const a = warn ? (blink ? 170 : 80) : 255 * fade;
                    const pulse = 1 + Math.sin(t * 4) * 0.05;
                    groundSprite('enemy/voidrift', h.ax, h.ay, h.width * 1.9 * pulse, h.width * 2.45 * pulse, 0, a);
                    groundSprite('enemy/voidrift', h.bx, h.by, h.width * 1.9 * pulse, h.width * 2.45 * pulse, 0, a);
                    const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                    under.strokeColor = color('#C77DFF', 70 * fade);
                    under.lineWidth = 2;
                    const shift = (t * 60) % 36;
                    for (let d = h.width + shift; d < len - h.width; d += 36) {
                        under.moveTo(h.ax + dx / len * d, h.ay + dy / len * d);
                        under.lineTo(h.ax + dx / len * Math.min(len - h.width, d + 14), h.ay + dy / len * Math.min(len - h.width, d + 14));
                    }
                    under.stroke();
                    break;
                }
                case 'well': {
                    // 引力井：旋转的漩涡贴图（排斥井反向旋转、染成洋红），外圈虚线标出影响范围。
                    const repel = (h.pull ?? 0) < 0 || (h.drag ?? 0) < 0;
                    const a = warn ? (blink ? 200 : 90) : 235;
                    const d = Math.min(220, h.width * 0.62) * (1 + Math.sin(t * 3) * 0.04);
                    groundSprite('enemy/gravitywell', h.ax, h.ay, d, d, (repel ? 1 : -1) * t * 120 % 360, a);
                    if (h.width < 420) {
                        under.strokeColor = color(repel ? '#FF5AC8' : '#C77DFF', warn ? (blink ? 160 : 60) : 70);
                        under.lineWidth = 2;
                        dashedCircle(under, h.ax, h.ay, h.width, 28);
                        under.stroke();
                    }
                    break;
                }
                case 'zone': {
                    // 凝视预警区：半透明矩形逐渐变浓，边框闪烁。
                    const k = 1 - (h.warn ?? 0);
                    const tone = h.tint ?? '#FF5AC8';
                    const x0 = Math.min(h.ax, h.bx), y0 = Math.min(h.ay, h.by), w = Math.abs(h.bx - h.ax), hh = Math.abs(h.by - h.ay);
                    top.fillColor = color(tone, (24 + 70 * k) * fade);
                    top.rect(x0, y0, w, hh);
                    top.fill();
                    top.strokeColor = color(tone, blink ? 230 : 120);
                    top.lineWidth = 3;
                    top.rect(x0, y0, w, hh);
                    top.stroke();
                    break;
                }
                case 'thread':
                    under.strokeColor = color('#E8E4FF', 150);
                    under.lineWidth = 2;
                    under.moveTo(h.ax, h.ay); under.lineTo(h.bx, h.by);
                    under.stroke();
                    break;
                case 'net': {
                    // 下垂的绳网：上下两条主绳 + 斜向网格。
                    const steps = 14, sag = 22;
                    const pt = (k: number, off: number) => ({ x: h.ax + (h.bx - h.ax) * k, y: h.ay + (h.by - h.ay) * k - Math.sin(k * Math.PI) * sag + off });
                    under.strokeColor = color('#3A2410', 200 * fade);
                    under.lineWidth = 5;
                    for (const off of [h.width, -h.width]) {
                        const p0 = pt(0, off);
                        under.moveTo(p0.x, p0.y);
                        for (let i = 1; i <= steps; i++) { const q = pt(i / steps, off); under.lineTo(q.x, q.y); }
                    }
                    under.stroke();
                    under.strokeColor = color('#D9B27A', 230 * fade);
                    under.lineWidth = 2;
                    for (let i = 0; i < steps; i++) {
                        const a0 = pt(i / steps, h.width), b0 = pt((i + 1) / steps, -h.width);
                        const a1 = pt(i / steps, -h.width), b1 = pt((i + 1) / steps, h.width);
                        under.moveTo(a0.x, a0.y); under.lineTo(b0.x, b0.y);
                        under.moveTo(a1.x, a1.y); under.lineTo(b1.x, b1.y);
                    }
                    for (const off of [h.width, -h.width]) {
                        const p0 = pt(0, off);
                        under.moveTo(p0.x, p0.y);
                        for (let i = 1; i <= steps; i++) { const q = pt(i / steps, off); under.lineTo(q.x, q.y); }
                    }
                    under.stroke();
                    break;
                }
                case 'laser':
                case 'vine': {
                    const vine = h.kind === 'vine';
                    if (warn) {
                        // 预警：闪烁的虚线，越接近出手越亮。
                        top.strokeColor = color(vine ? '#8CFF6A' : '#FF3A5A', (blink ? 230 : 120) * (1 - (h.warn ?? 0) * 0.5));
                        top.lineWidth = 3;
                        const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                        for (let d = 0; d < len; d += 34) {
                            const e = Math.min(len, d + 20);
                            top.moveTo(h.ax + dx / len * d, h.ay + dy / len * d);
                            top.lineTo(h.ax + dx / len * e, h.ay + dy / len * e);
                        }
                        top.stroke();
                        break;
                    }
                    const layers: [string, number, number][] = vine
                        ? [['#1F5A1A', 2.4, 230], ['#4FB83A', 1.6, 255], ['#B8FF8A', 0.5, 255]]
                        : [['#FF2A4A', 2.8, 70], ['#FF3A5A', 1.6, 220], ['#FFFFFF', 0.6, 255]];
                    for (const [hex, k, a] of layers) {
                        top.strokeColor = color(hex, a * fade);
                        top.lineWidth = Math.max(2, h.width * k * (1 + Math.sin(t * 50) * 0.06));
                        top.moveTo(h.ax, h.ay); top.lineTo(h.bx, h.by);
                        top.stroke();
                    }
                    if (vine) {
                        // 藤鞭上的叶片：沿鞭身交错的小三角。
                        const dx = h.bx - h.ax, dy = h.by - h.ay, len = Math.hypot(dx, dy) || 1;
                        const ux = dx / len, uy = dy / len;
                        top.fillColor = color('#7BE05A', 230 * fade);
                        for (let d = 30, i = 0; d < len; d += 46, i++) {
                            const side = i % 2 ? 1 : -1;
                            const x = h.ax + ux * d, y = h.ay + uy * d;
                            top.moveTo(x, y);
                            top.lineTo(x + ux * 14 - uy * side * h.width * 1.6, y + uy * 14 + ux * side * h.width * 1.6);
                            top.lineTo(x + ux * 24, y + uy * 24);
                            top.close();
                        }
                        top.fill();
                    }
                    break;
                }
            }
        }
        for (let i = lavaUsed; i < this.lavaSprites.length; i++) this.lavaSprites[i].sprite.node.active = false;
        // 暴风雪：沿风向斜飞的雪线，风越大越密、越斜。
        if (c.wind) {
            const dir = Math.sign(c.wind), strength = Math.min(1, Math.abs(c.wind) / 160);
            top.strokeColor = color('#E8F2FF', 90 * strength);
            top.lineWidth = 2;
            const h = c.bounds.top - c.bounds.bottom, w = c.bounds.right - c.bounds.left;
            for (let i = 0; i < 26; i++) {
                const k = (i * 0.618 + t * (0.5 + (i % 5) * 0.08)) % 1;
                const y = c.bounds.top - ((i * 0.37 + t * 0.9) % 1) * h;
                const x = c.bounds.left + (dir > 0 ? k : 1 - k) * w;
                top.moveTo(x, y);
                top.lineTo(x - dir * 46 * strength, y + 10);
            }
            top.stroke();
        }
        // 护盾无人机：被守护的敌人外圈青色护罩 + 连向无人机的细光线。
        for (const e of c.enemies) {
            const gd = e.guard;
            if (e.dead || !gd || gd.dead) continue;
            const pulse = 0.85 + Math.sin(t * 8 + e.id) * 0.15;
            top.strokeColor = color('#5ADCFF', 200 * pulse);
            top.lineWidth = 3;
            top.circle(e.x, e.y, e.radius * 1.25);
            top.stroke();
            top.fillColor = color('#5ADCFF', 34 * pulse);
            top.circle(e.x, e.y, e.radius * 1.25);
            top.fill();
            top.strokeColor = color('#AEEFFF', 120);
            top.lineWidth = 2;
            top.moveTo(gd.x, gd.y); top.lineTo(e.x, e.y);
            top.stroke();
        }
    }

    /** 连线敌人之间的电束：青色抖动折线 + 白芯（每对只画一次）。 */
    private renderBeams(c: SfCombat): void {
        const g = this.overlay;
        for (const e of c.enemies) {
            const o = e.link;
            if (!o || e.dead || o.dead || !e.entered || !o.entered || e.id > o.id) continue;
            const segs = 10;
            for (const [hex, width, alpha] of [['#5ADCFF', 9, 120], ['#FFFFFF', 3, 230]] as [string, number, number][]) {
                g.strokeColor = color(hex, alpha);
                g.lineWidth = width;
                g.moveTo(e.x, e.y);
                for (let i = 1; i < segs; i++) {
                    const k = i / segs;
                    const jx = (Math.random() - 0.5) * 16, jy = (Math.random() - 0.5) * 16;
                    g.lineTo(e.x + (o.x - e.x) * k + jx, e.y + (o.y - e.y) * k + jy);
                }
                g.lineTo(o.x, o.y);
                g.stroke();
            }
        }
    }

    /** 落雷：预警期为闪烁的半透明柱 + 边线；落下时一道折线闪电贯穿全屏，0.3 秒淡出。 */
    private renderStrikes(c: SfCombat, dt: number): void {
        const g = this.overlay;
        const top = c.bounds.top, bottom = c.bounds.bottom;
        for (let i = this.strikes.length - 1; i >= 0; i--) {
            const s = this.strikes[i];
            s.t += dt;
            if (!s.hit) {
                const blink = Math.floor(this.time * 10) % 2 === 0;
                const k = Math.min(1, s.t / Math.max(0.01, s.warn));
                g.fillColor = color('#FFE38A', (blink ? 60 : 30) + 50 * k);
                g.rect(s.x - 46, bottom, 92, top - bottom);
                g.fill();
                g.fillColor = color('#FFE38A', 200);
                g.rect(s.x - 46, bottom, 3, top - bottom);
                g.rect(s.x + 43, bottom, 3, top - bottom);
                g.fill();
                continue;
            }
            const a = 1 - s.t / 0.3;
            if (a <= 0) { this.strikes.splice(i, 1); continue; }
            for (const [hex, width] of [['#8CE4FF', 16], ['#FFFFFF', 5]] as [string, number][]) {
                g.strokeColor = color(hex, 255 * a);
                g.lineWidth = width;
                let x = s.x;
                g.moveTo(x, top);
                for (let y = top; y > bottom; y -= 70) {
                    x = s.x + (Math.random() - 0.5) * 50;
                    g.lineTo(x, y - 70);
                }
                g.stroke();
            }
        }
    }

    private renderFlash(): void {
        const g = this.flashLayer;
        g.clear();
        if (this.camera.flash > 0.002) {
            g.fillColor = color(this.camera.gold ? COLORS.cream : '#FFF6C9', this.camera.flash * 255);
            g.rect(-this.width / 2, -this.height / 2, this.width, this.height);
            g.fill();
        }
    }

    /** 长卷背景：按屏宽（含镜头余量）等比铺满，自下而上首尾相接，随卷动循环。 */
    private renderStrips(padding: number): void {
        const f = this.scrollFrame!;
        const w = this.width + padding * 2;
        const h = w * f.originalSize.height / f.originalSize.width;
        const count = Math.ceil((this.height + padding * 2) / h) + 1;
        while (this.strips.length < count) {
            const strip = sprite(this.ui, this.stripRoot, 'env/ch1-sea', 10, 10, 0, 0, 'Strip');
            strip.spriteFrame = f;
            this.strips.push(strip);
        }
        const offset = (this.scroll * this.scale) % h;
        const bottom = -this.height / 2 - padding;
        this.strips.forEach((strip, i) => {
            strip.node.active = i < count;
            size(strip.node, w, h + 1);
            strip.node.setPosition(this.camera.x, Math.round(bottom + h / 2 + i * h - offset + this.camera.y));
        });
    }

    private updateDecor(c: SfCombat, dt: number): void {
        this.decorTimer -= dt;
        if (this.decorTimer <= 0) {
            this.decorTimer = 2.2 + Math.random() * 2.8;
            this.spawnDecor(c, c.bounds.top + 200);
        }
        this.cloudTimer -= dt;
        if (this.cloudTimer <= 0 && (CLOUD_ALPHA[this.chapter] ?? 104) > 0) {
            this.cloudTimer = 4 + Math.random() * 4;
            if (this.decor.filter(d => d.node.parent === this.cloudLayer).length < 4) this.spawnCloud(c);
        }
        for (let i = this.decor.length - 1; i >= 0; i--) {
            const d = this.decor[i];
            d.y -= c.scrollSpeed * d.speed * dt;
            d.node.setPosition(d.node.position.x + (d.wind ?? 0) * dt, Math.round(d.y));
            if (d.y < c.bounds.bottom - d.h) {
                d.node.active = false;
                this.decorPool.push(d.node);
                this.decor.splice(i, 1);
            }
        }
    }

    private takeDecorNode(layer: Node): Node {
        const n = this.decorPool.pop();
        if (n) { n.removeFromParent(); layer.addChild(n); n.active = true; return n; }
        const s = sprite(this.ui, layer, this.decorKeys[0] ?? 'env/ch1-decor-1', 10, 10, 0, 0, 'Decor');
        s.node.addComponent(UIOpacity);
        return s.node;
    }

    private spawnDecor(c: SfCombat, y: number): void {
        if (this.decorKeys.length === 0) return;
        const key = this.decorKeys[Math.floor(Math.random() * this.decorKeys.length)];
        const f = this.ui.frame(key);
        if (!f) return;
        const n = this.takeDecorNode(this.groundLayer);
        const s = n.getComponent(Sprite)!;
        s.spriteFrame = f;
        s.color = color('#FFFFFF');
        const w = f.originalSize.width * 2, h = f.originalSize.height * 2;
        size(n, w, h);
        n.getComponent(UIOpacity)!.opacity = 255;
        const side = Math.random() < 0.5 ? -1 : 1;
        // 长卷章节的装饰是两侧树冠：贴着屏幕边缘，比地面卷得稍快形成视差。
        const x = this.scrollFrame
            ? side * (c.bounds.right - w * (0.12 + Math.random() * 0.2))
            : side * (c.bounds.right - w * 0.25 - Math.random() * 120);
        n.setPosition(Math.round(x), Math.round(y + h / 2));
        n.setScale(Math.random() < 0.5 ? -1 : 1, 1, 1);
        n.angle = 0;
        this.decor.push({ node: n, y: y + h / 2, speed: this.scrollFrame ? 1.3 : 1, h });
    }

    private spawnCloud(c: SfCombat, startY?: number): void {
        const keys = ['fx/cloud-1', 'fx/cloud-2', 'fx/cloud-3'];
        const f = this.ui.frame(keys[Math.floor(Math.random() * keys.length)]);
        if (!f) return;
        const n = this.takeDecorNode(this.cloudLayer);
        const s = n.getComponent(Sprite)!;
        s.spriteFrame = f;
        s.color = color('#FFFFFF');
        const zoom = 1.9 + Math.random() * 0.7;
        const w = f.originalSize.width * zoom * texScale('fx/cloud'), h = f.originalSize.height * zoom * texScale('fx/cloud');
        size(n, w, h);
        n.getComponent(UIOpacity)!.opacity = (CLOUD_ALPHA[this.chapter] ?? 104) * (0.8 + Math.random() * 0.2);
        const y = startY ?? c.bounds.top + h;
        const side = Math.random() < 0.5 ? -1 : 1;
        n.setPosition(side * (90 + Math.random() * 240), y);
        n.setScale(side, 1, 1);
        n.angle = (Math.random() - 0.5) * 18;
        this.decor.push({ node: n, y, speed: 1.4 + Math.random() * 0.35, h, wind: side * (3 + Math.random() * 7) });
    }

    /** 续局只补回仍在生效的预警，避免重新播放击杀、奖励或震屏。 */
    restoreWarnings(c: SfCombat, events: CombatEvent[]): void {
        for (const e of events) {
            if (e.type === 'strike-warn') this.consume(c, [e]);
            else if (e.type === 'telegraph') this.fx.ring(e.x ?? 0, e.y ?? 0, 160, 40, e.value ?? 0.35, '#FF5A6A');
        }
    }

    // ───────────────────────────── 事件 → 特效 ─────────────────────────────

    consume(c: SfCombat, events: CombatEvent[]): void {
        const p = c.player;
        for (const e of events) {
            const x = e.x ?? 0, y = e.y ?? 0;
            switch (e.type) {
                case 'sector':
                    // 无尽模式换章：白闪遮住海面与装饰的切换。
                    if (c.level.chapter !== this.chapter) {
                        this.setChapter(c.level.chapter);
                        this.camera.flash = Math.max(this.camera.flash, 0.6);
                    }
                    break;
                case 'hit':
                    this.fx.spark(x, y, BODY_SPARK[e.kind ?? 'metal'] ?? 'metal', (e.size ?? 1) > 1);
                    break;
                case 'shield-hit':
                    if (Math.random() < 0.35) this.fx.spark(x, y, 'shield');
                    break;
                case 'kill': {
                    const level = e.size ?? 1;
                    const tier = level <= 1 ? 0 : level === 2 ? 1 : level < 5 ? 2 : 3;
                    const boss = level >= 5;
                    this.fx.explosion(x, y, level, BODY_SPARK[e.kind ?? 'metal'] === 'balloon' ? 'balloon' : 'fire');
                    // tidal-wings 击杀：按体型档震屏、曝光、朝玩家方向的镜头踢动、两道压力波。
                    this.camera.killShake(c.combo, tier, boss, 1);
                    this.camera.kickToward(x, y, p.x, p.y, boss ? 4.8 : 1.35 + tier * 0.72);
                    const radius = [38, 54, 76, 136][tier] * UNIT;
                    this.fx.wave(x, y, radius, [0.2, 0.28, 0.38, 0.62][tier], 0.78 + tier * 0.16, boss ? COLORS.cream : tier >= 2 ? COLORS.orange : COLORS.gold);
                    if (tier >= 1) this.fx.wave(x, y, radius * (tier >= 3 ? 1.18 : 0.82), [0.2, 0.24, 0.3, 0.46][tier], 0.58 + tier * 0.12, tier >= 2 ? COLORS.cream : COLORS.orange, tier >= 2 ? 0.055 : 0.04);
                    if (level >= 3) this.hitstop = Math.max(this.hitstop, level >= 4 ? 0.06 : 0.035);
                    break;
                }
                case 'chain':
                    this.fx.explosion(x, y, 2, 'fire');
                    this.fx.wave(x, y, e.size ?? 90, 0.3, 0.9, COLORS.orange);
                    this.camera.shake = Math.max(this.camera.shake, 3 + Math.min(4, e.value ?? 1) * 0.5);
                    break;
                case 'explosion':
                    if (e.kind === 'cancel') this.fx.explosion(x, y, 0);
                    else if (e.kind === 'keg') { this.fx.explosion(x, y, 3); this.camera.shake = Math.max(this.camera.shake, 6); }
                    else if (e.kind === 'lava') this.fx.explosion(x, y, 1, 'fire');
                    else if (e.kind === 'ice') this.fx.explosion(x, y, 0);
                    else this.fx.explosion(x, y, (e.size ?? 40) > 60 ? 2 : 1);
                    break;
                case 'graze':
                    if (this.grazeCooldown <= 0) { this.grazeCooldown = 0.05; this.fx.spark(x, y, 'graze'); }
                    break;
                case 'hurt':
                    this.playerJelly = 0.24;
                    this.fx.explosion(x, y, 2, 'fire');
                    this.fx.wave(x, y, 76 * UNIT, 0.35, 0.85, '#FFAA7C');
                    this.fx.debris(x, y, 18, 180, 'hurt');
                    this.camera.shake = Math.max(this.camera.shake, 10);
                    this.camera.kickY = 5;
                    this.camera.hit = 1;
                    this.camera.flash = Math.max(this.camera.flash, 0.34);
                    this.camera.gold = false;
                    this.hitstop = Math.max(this.hitstop, 0.055);
                    break;
                case 'part-lost':
                    this.disassemble(c, e.slot!, e.value ?? 1);
                    break;
                case 'dead':
                    this.fx.explosion(x, y, 5, 'fire');
                    this.camera.shake = 13;
                    this.camera.flash = 0.4;
                    this.hitstop = 0.12;
                    break;
                case 'revive':
                    this.fx.ring(x, y, 40, 520, 0.6, COLORS.foam);
                    break;
                case 'assemble':
                    for (const side of [-1, 1]) {
                        const m = this.mountPos(e.slot!, side);
                        this.fx.glow(p.x + m.x, p.y + m.y, 70, SLOT_HEX[e.slot!], 0.25, 0.95);
                        this.fx.spark(p.x + m.x, p.y + m.y, 'gold', true);
                    }
                    this.fx.wave(p.x, p.y, 120, 0.3, 0.8, '#FFE38A');
                    this.camera.shake = Math.max(this.camera.shake, 3.8);
                    this.camera.kickY = 1.5;
                    break;
                case 'fire-buff':
                    // ring 参数为直径，扩张后的半径为 260。
                    this.fx.ring(x, y, 24, 520, 0.45, '#FFB43C');
                    this.schedule(0.1, () => this.fx.ring(x, y, 24, 520, 0.45, '#FFB43C'));
                    this.fx.debris(x, y, 14, 260, 'buff');
                    this.camera.shake = Math.max(this.camera.shake, 4);
                    this.fx.glow(x, y, 180, '#FFB43C', 0.35);
                    break;
                case 'repair':
                    this.fx.ring(x, y, 24, 220, 0.4, '#7BF08A');
                    // 两条同速碎片组成加号，向上飘散。
                    for (let i = 0; i < 10; i++) {
                        const px = x + (Math.random() - 0.5) * 120, py = y + (Math.random() - 0.5) * 70;
                        const opts = { vx: (Math.random() - 0.5) * 60, vy: 140 + Math.random() * 40, life: 0.6, tint: '#7BF08A' };
                        this.fx.spawn('fx/chip', px, py, { ...opts, w: 18, h: 5 });
                        this.fx.spawn('fx/chip', px, py, { ...opts, w: 5, h: 18 });
                    }
                    this.camera.flash = Math.max(this.camera.flash, 0.08);
                    break;
                case 'pickup':
                    this.fx.glow(x, y, 90, e.kind === 'fire' ? '#FFB43C' : COLORS.foam, 0.22);
                    break;
                case 'boss-part':
                    this.fx.explosion(x, y, 4, 'fire');
                    this.fx.wave(x, y, 110 * UNIT, 0.46, 0.9, COLORS.cream);
                    this.camera.shake = Math.max(this.camera.shake, 9);
                    this.camera.flash = Math.max(this.camera.flash, 0.16);
                    this.hitstop = Math.max(this.hitstop, 0.08);
                    break;
                case 'boss-phase':
                    this.camera.shake = Math.max(this.camera.shake, 5);
                    this.fx.ring(x, y, 80, 900, 0.5, '#FFFFFF');
                    break;
                case 'boss-warning':
                    this.warningAge = 0;
                    break;
                case 'boss-defeated':
                    this.bossFinale(c, x, y);
                    break;
                case 'strike-warn':
                    this.strikes.push({ x, t: 0, warn: e.value ?? 1, hit: false });
                    break;
                case 'strike': {
                    const s = this.strikes.find(k => !k.hit && Math.abs(k.x - x) < 1);
                    if (s) { s.hit = true; s.t = 0; } else this.strikes.push({ x, t: 0, warn: 0, hit: true });
                    this.camera.shake = Math.max(this.camera.shake, 6);
                    this.camera.flash = Math.max(this.camera.flash, 0.25);
                    this.camera.gold = false;
                    break;
                }
                case 'telegraph':
                    this.fx.ring(x, y, 160, 40, 0.35, '#FF5A6A');
                    break;
                case 'lock':
                    this.fx.spawn('fx/reticle', x, y, { life: 0.25, scale: 2.2, scaleEnd: 1, alpha: 0.9 });
                    break;
                case 'ultimate':
                    this.startUltimate(c, e.kind ?? '');
                    break;
                case 'shot':
                    if (e.slot === 'main' && p.alive) {
                        const h = PLANE_ART[this.planeId]?.size[1] ?? 130;
                        // 曙光是持续激光（枪口光球由激光绘制），其他机体按主题色闪枪口焰。
                        if (c.config.plane !== 'dawn') this.fx.spawn('fx/muzzle', p.x, p.y + h * 0.48, { life: 0.05, scale: c.config.plane === 'thunder' ? 1.5 : 1.1, alpha: 0.95, tint: MUZZLE_TINT[c.config.plane] ?? '#FFFFFF' });
                    }
                    break;
            }
        }
    }

    /** 解体：被击中掉的那一级零件从挂点炸开，一侧化作碎片翻滚飞走（另一侧变成可回收的零件）。 */
    private disassemble(c: SfCombat, slot: SlotId, level: number): void {
        const p = c.player;
        for (const side of [-1, 1]) {
            const m = this.mountPos(slot, side);
            this.fx.explosion(p.x + m.x, p.y + m.y, 1, 'fire');
            this.fx.debris(p.x + m.x, p.y + m.y, 10, 260, 'metal');
        }
        const f = this.ui.frame(`plane/${this.planeId}/${slot}-${level}`);
        if (!f) return;
        const m = this.mountPos(slot, -1);
        const s = sprite(this.ui, this.playerLayer, `plane/${this.planeId}/${slot}-${level}`, f.originalSize.width, f.originalSize.height, p.x + m.x, p.y + m.y, 'Debris');
        s.node.setScale(-1.4, 1.4, 1);
        this.flyers.push({ node: s.node, t: 0, life: 0.9, vx: -240 - Math.random() * 120, vy: 300 + Math.random() * 120, spin: -720, rot: 0 });
    }

    /** 保留最后击破的真实机体，先在原位置震颤发热，主爆时再沿船体切成飞散残骸。 */
    private bossFinale(c: SfCombat, x: number, y: number): void {
        this.bossWreck?.root.destroy();
        const root = node(this.fxRoot, 'BossWreck', 0, 0, x, y);
        root.setSiblingIndex(0);
        const bodies: BossWreckBody[] = [];
        for (const e of (c.boss?.bodies ?? []).concat(c.boss?.parts ?? [])) {
            // 已在之前被击毁的部件不重新出现；最后一帧的视图在 renderEnemies 中才移除。
            if (!this.enemies.has(e.id) || !e.frame) continue;
            const f = this.ui.frame(e.frame);
            if (!f) continue;
            const w = f.originalSize.width * 2, h = f.originalSize.height * 2;
            const n = node(root, 'Hull', w, h, e.x - x, e.y - y);
            const s = sprite(this.ui, n, e.frame, w, h);
            n.setScale(e.scale, Math.abs(e.scale), 1);
            n.angle = e.angle * 180 / Math.PI;
            bodies.push({ node: n, sprite: s, frame: e.frame, w, h, scale: e.scale, angle: n.angle });
        }
        this.bossWreck = { root, bodies, t: 0 };
        const extent = bodies.reduce((d, b) => Math.max(d, Math.max(b.w, b.h) * Math.abs(b.scale)), 240);
        const radius = Math.min(330, Math.max(150, extent * 0.62));
        this.camera.shake = 15;
        this.camera.flash = 0.36;
        this.camera.gold = true;
        this.hitstop = Math.max(this.hitstop, 0.16);
        this.fx.explosion(x, y, 4);
        this.fx.wave(x, y, radius, 0.5, 0.75, COLORS.gold);
        this.fx.glow(x, y, radius * 1.1, '#FF8D40', 1.35, 0.55);
        for (let i = 0; i < 9; i++) {
            const body = bodies[i % Math.max(1, bodies.length)];
            const ox = body ? body.node.position.x + (Math.random() - 0.5) * body.w * Math.abs(body.scale) * 0.72 : (Math.random() - 0.5) * radius;
            const oy = body ? body.node.position.y + (Math.random() - 0.5) * body.h * Math.abs(body.scale) * 0.6 : (Math.random() - 0.5) * radius;
            this.schedule(0.18 + i * 0.115, () => {
                this.fx.explosion(x + ox, y + oy, i % 3 === 2 ? 4 : 3);
                this.camera.shake = Math.max(this.camera.shake, 6 + i * 0.55);
                this.onBossBlast?.(false);
            });
        }
        this.schedule(1.35, () => {
            this.onBossBlast?.(true);
            this.shatterBossWreck();
            this.fx.explosion(x, y, 5);
            this.fx.explosion(x - radius * 0.45, y + 24, 4, 'fire', 0.08);
            this.fx.explosion(x + radius * 0.45, y - 24, 4, 'fire', 0.16);
            this.fx.glow(x, y, radius * 2.4, '#FFB54A', 0.75, 0.9);
            this.fx.spawn('fx/flash', x, y, { w: radius * 2.8, h: 58, scale: 0.3, scaleEnd: 1.45, life: 0.28, tint: '#FFF3CE', alpha: 0.85 });
            this.fx.wave(x, y, radius * 2.3, 0.9, 0.92, COLORS.cream);
            this.fx.wave(x, y, radius * 1.9, 0.8, 0.66, '#FFAE52', 0.1);
            this.fx.ring(x, y, 90, radius * 4.6, 0.95, '#FFE5AC');
            this.fx.debris(x, y, 66, 730, 'fire');
            this.camera.shake = 20;
            this.camera.kickY = -5;
            this.camera.flash = 0.6;
            this.camera.gold = true;
            this.hitstop = Math.max(this.hitstop, 0.16);
        });
    }

    private renderBossWreck(dt: number): void {
        const wreck = this.bossWreck;
        if (!wreck) return;
        wreck.t += dt;
        const heat = Math.min(1, wreck.t / 1.35);
        wreck.root.angle = Math.sin(wreck.t * 31) * heat * 1.8;
        for (const body of wreck.bodies) {
            body.sprite.color = color(mixHex('#FFFFFF', '#FF9252', heat * 0.72));
            body.node.angle = body.angle + Math.sin(wreck.t * 67) * heat * 2.4;
        }
    }

    /** 使用矩形遮罩切开原机体帧，复用纹理；短时残骸最多 18 块，随本视图释放。 */
    private shatterBossWreck(): void {
        const wreck = this.bossWreck;
        if (!wreck) return;
        let pieces = 0;
        for (const body of wreck.bodies) {
            const cols = body.w >= 200 && pieces < 10 ? 3 : 1;
            const rows = cols === 3 ? 2 : 1;
            const w = body.w / cols, h = body.h / rows;
            const angle = (body.node.angle + wreck.root.angle) * Math.PI / 180;
            for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
                if (pieces >= 18) break;
                const cx = (col + 0.5) * w - body.w / 2, cy = (row + 0.5) * h - body.h / 2;
                const lx = cx * body.scale, ly = cy * Math.abs(body.scale);
                const x = wreck.root.position.x + body.node.position.x + lx * Math.cos(angle) - ly * Math.sin(angle);
                const y = wreck.root.position.y + body.node.position.y + lx * Math.sin(angle) + ly * Math.cos(angle);
                const piece = node(this.fxRoot, 'BossShard', w, h, x, y);
                piece.setSiblingIndex(0);
                piece.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
                const hull = sprite(this.ui, piece, body.frame, body.w, body.h, -cx, -cy, 'HullFragment');
                hull.color = color('#D69A74');
                piece.setScale(body.scale, Math.abs(body.scale), 1);
                piece.angle = angle * 180 / Math.PI;
                const dx = x - wreck.root.position.x, dy = y - wreck.root.position.y;
                const len = Math.max(1, Math.hypot(dx, dy));
                this.flyers.push({ node: piece, t: 0, life: 1.65 + Math.random() * 0.45,
                    vx: dx / len * (220 + Math.random() * 160), vy: dy / len * 190 + 170,
                    spin: (pieces % 2 ? -1 : 1) * (90 + Math.random() * 140), rot: piece.angle });
                pieces++;
            }
        }
        wreck.root.destroy();
        this.bossWreck = undefined;
    }

    /** 视图内的延时演出（随视图一起清理，不使用全局计时器）。 */
    schedule(delay: number, run: () => void): void {
        this.pendingTimers.push({ t: delay, run });
    }

    tickTimers(dt: number): void {
        for (let i = 0; i < this.pendingTimers.length; i++) {
            const job = this.pendingTimers[i];
            job.t -= dt;
            if (job.t <= 0) { this.pendingTimers.splice(i, 1); i--; job.run(); }
        }
    }

    private startUltimate(c: SfCombat, plane: string): void {
        if (plane !== 'thunder') return;
        const f = this.ui.frame('plane/thunder/body');
        for (let i = 0; i < 3; i++) {
            const n = node(this.fxRoot, 'Bomber', 10, 10);
            const s = n.addComponent(Sprite);
            s.sizeMode = Sprite.SizeMode.CUSTOM;
            if (f) { s.spriteFrame = f; size(n, f.originalSize.width * 1.3, f.originalSize.height * 1.3); }
            s.color = color('#3A2A4A', 230);
            const x = (i - 1) * 220;
            this.ultimateActors.push({ node: n, t: -i * 0.1, life: 2.6, x0: x, y0: c.bounds.bottom - 160, x1: x, y1: c.bounds.top + 200 });
        }
    }

    private renderUltimateActors(dt: number): void {
        for (let i = this.ultimateActors.length - 1; i >= 0; i--) {
            const a = this.ultimateActors[i];
            a.t += dt;
            const k = Math.max(0, Math.min(1, a.t / a.life));
            a.node.setPosition(a.x0 + (a.x1 - a.x0) * k, a.y0 + (a.y1 - a.y0) * k);
            if (a.t >= a.life) { a.node.destroy(); this.ultimateActors.splice(i, 1); }
        }
    }

    get fieldScale(): number { return this.scale; }

    dispose(): void {
        this.pendingTimers = [];
        this.bossWreck = undefined;
        this.flyers.length = 0;
        this.ultimateActors.length = 0;
        this.root.destroy();
        this.enemies.clear();
    }
}

function trim(list: TrailPoint[], max: number, life: number): void {
    while (list.length > max || (list.length > 0 && list[0].age > life)) list.shift();
}

/** 虚线圆：segments 段，每段画一半弧长。 */
function dashedCircle(g: Graphics, x: number, y: number, r: number, segments: number): void {
    for (let i = 0; i < segments; i++) {
        const a0 = i * Math.PI * 2 / segments, a1 = a0 + Math.PI / segments;
        g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
        for (let k = 1; k <= 4; k++) {
            const a = a0 + (a1 - a0) * k / 4;
            g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
    }
}
