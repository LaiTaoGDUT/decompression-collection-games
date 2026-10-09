import type { Motion } from './SfMotion';
import type { PickupKind } from './SfTypes';
import { HP_UNITS } from './SfBalance';
import type { EnemyBehavior } from './content/SfContentTypes';
import { CH1_ENEMIES } from './content/ch1/enemies';
import { CH2_ENEMIES } from './content/ch2/enemies';
import { CH3_ENEMIES } from './content/ch3/enemies';
import { CH4_ENEMIES } from './content/ch4/enemies';
import { CH5_ENEMIES } from './content/ch5/enemies';
import { CH6_ENEMIES } from './content/ch6/enemies';

export type EnemySize = 'small' | 'medium' | 'large' | 'elite' | 'part' | 'boss';

/** 敌人开火规则：由通用发射器按间隔执行；出手前 windup 秒闪烁预警。 */
export interface FireSpec {
    pattern: 'aimed' | 'fan' | 'ring' | 'drop' | 'line' | 'down';
    interval: number;
    speed: number;
    kind: string;
    count?: number;
    /** 扇形总角度（度）。 */
    spread?: number;
    radius?: number;
    delay?: number;
    windup?: number;
    burst?: number;
    burstGap?: number;
    /** 发射口相对敌人中心的偏移（设计像素，敌人朝下）。 */
    muzzle?: { x: number; y: number };
    fuse?: number;
    burstSpec?: { count: number; speed: number; kind: string; radius: number; offset?: number };
}

export interface EnemyDef {
    id: string;
    name: string;
    frame: string;
    size: EnemySize;
    /** 血量单位（× 标准火力 F(n)）。 */
    hp: number;
    radius: number;
    score: number;
    energy: number;
    /** 显示宽度（设计像素）；图片按美术网格 ×2 显示时可忽略。 */
    scale?: number;
    ground?: boolean;
    /** 根据速度方向旋转贴图（默认朝下）。 */
    face?: boolean;
    fire?: FireSpec[];
    /** 死亡时的弹幕（如气球炸弹炸开）。 */
    deathBurst?: { count: number; speed: number; kind: string; radius: number };
    /** 被击毁后的金币数量。 */
    coins?: number;
    /** 生物还是机械：决定命中火花和爆炸颜色。 */
    body: 'metal' | 'wood' | 'flesh' | 'balloon';
    /** 图鉴描述。 */
    intro: string;
    /** 专属行为（第 2 章起的敌人，见 content/SfContentTypes）。 */
    behavior?: EnemyBehavior;
    /** 碰撞玩家时造成伤害（地面/海面目标不会）。 */
    contact?: boolean;
    chapter: number;
}

export interface FireState {
    spec: FireSpec;
    timer: number;
    burstLeft: number;
    burstTimer: number;
}

export interface Enemy {
    id: number;
    def: EnemyDef;
    x: number; y: number;
    vx: number; vy: number;
    angle: number;
    hp: number;
    maxHp: number;
    radius: number;
    age: number;
    motion: Motion | null;
    fires: FireState[];
    parent?: Enemy;
    ox: number; oy: number;
    /** 受到伤害的倍率（护盾、无敌阶段 = 0）。 */
    damageScale: number;
    entered: boolean;
    hitFlash: number;
    /** 命中火花与音效的冷却时间（每敌人独立）。 */
    hitFx: number;
    /** 出手预警剩余时间（视图闪烁）。 */
    windup: number;
    /** 冲锋瞄准方向（视图画锁定线）。 */
    aimX: number; aimY: number;
    frame: string;
    drop?: PickupKind;
    group?: number;
    dead?: boolean;
    escaped?: boolean;
    boss?: boolean;
    bossTier?: string;
    /** 隐藏 Boss 等换色：视图据此着色。 */
    tint?: string;
    /** 打掉后挂点不可再受伤（部件残骸）。 */
    wreck?: boolean;
    /** 场地物件（虚空裂缝等）：与 wreck 一起设置，不参与碰撞和伤害，视图按原色显示而不是残骸灰。 */
    decor?: boolean;
    /** 猎鹰锁定计数。 */
    locks: number;
    /** 被雷霆武器打死时会殉爆。 */
    volatile: number;
    /** 部件：被摧毁时的回调标签。 */
    partTag?: string;
    /** 出场后不离场（Boss、部件）。 */
    persistent?: boolean;
    /** 机械蟹等的显示缩放。 */
    scale: number;
    /** 视觉朝向修正：true 时贴图跟随速度。 */
    face: boolean;
    shield?: number;
    /** 护盾来源部件：任一存活时本体只受 8% 伤害。 */
    shieldParts?: Enemy[];
    extraDrops?: PickupKind[];
    /** 屏蔽本体伤害的部件（主帆）。 */
    coveredBy?: Enemy;
    /** 受击形变（视图，tidal-wings 参数）：剩余时间、总时长、力度，以及受击踢动。 */
    jelly: number;
    jellyMax: number;
    jellyStrength: number;
    kickY: number;
    /** 记录最后伤害来源。 */
    lastSlot?: string;
    hpScale: number;
    /** 覆盖默认击坠分（Boss 按级别给分）。 */
    scoreValue?: number;
    /** 专属行为的状态存储（计时器、阶段等）。 */
    data: Record<string, number>;
    /** 连线伙伴：双方都存活时视图在两者之间画电束（伤害判定由行为自己处理）。 */
    link?: Enemy;
    /** 显示透明度 0～1（潜航、隐身等）；未设置为 1。 */
    alpha?: number;
    /** 炮台底座（礁石要塞、激光平台）：只做显示，被炮塔 coveredBy 遮挡，不显示血条，炮塔被毁时随之炸毁。 */
    base?: boolean;
    /** 护盾无人机：守护者存活时本敌人只受 20% 伤害（视图画护罩与连线）。 */
    guard?: Enemy;
}

const T = HP_UNITS;


const DEFS: EnemyDef[] = [
    // ── 第 1 章 · 晴空港湾 · 空贼团 ──
    {
        id: 'raider', name: '纸翼小贼', frame: 'enemy/raider', size: 'small', hp: T.small, radius: 26, score: 100, energy: 1,
        face: true, body: 'wood', contact: true, chapter: 1, coins: 1,
        fire: [{ pattern: 'aimed', interval: 3.4, speed: 230, kind: 'orb-s', radius: 7, delay: 0.9, windup: 0.3 }],
        intro: '空贼团的杂兵，成群俯冲，偶尔打出一发瞄准弹。',
    },
    {
        id: 'gyro', name: '螺旋蜻蜓机', frame: 'enemy/gyro', size: 'small', hp: T.small * 0.9, radius: 26, score: 100, energy: 1,
        face: true, body: 'wood', contact: true, chapter: 1, coins: 1,
        intro: '从两侧蛇形穿场，不开火，只会撞人。',
    },
    {
        id: 'balloon', name: '气球炸弹', frame: 'enemy/balloon', size: 'small', hp: T.small * 1.6, radius: 30, score: 150, energy: 2,
        body: 'balloon', contact: true, chapter: 1, coins: 2,
        deathBurst: { count: 8, speed: 170, kind: 'star', radius: 9 },
        intro: '缓慢飘落，被打爆时炸出一圈弹幕——在远处先打掉它。',
    },
    {
        id: 'gunboat', name: '海盗炮艇', frame: 'enemy/gunboat', size: 'medium', hp: T.medium * 1.2, radius: 34, score: 300, energy: 3,
        ground: true, body: 'wood', chapter: 1, coins: 3,
        fire: [{ pattern: 'aimed', interval: 2.6, speed: 250, kind: 'orb-s', radius: 7, burst: 3, burstGap: 0.16, delay: 1.0, windup: 0.4, muzzle: { x: 0, y: -10 } }],
        intro: '随海面漂来，甲板炮塔打出三连发瞄准弹。',
    },
    {
        id: 'bomber', name: '双翼轰炸机', frame: 'enemy/bomber', size: 'medium', hp: T.medium * 1.6, radius: 44, score: 400, energy: 4,
        face: false, body: 'wood', contact: true, chapter: 1, coins: 4,
        fire: [{
            pattern: 'drop', interval: 1.1, speed: 90, kind: 'bomb', radius: 11, delay: 0.6, fuse: 1.25,
            burstSpec: { count: 4, speed: 170, kind: 'ring', radius: 10 }
        }],
        intro: '横穿屏幕投下炸弹，炸弹落下后炸成十字弹。',
    },
    {
        id: 'anchorship', name: '铁锚飞艇', frame: 'enemy/anchorship', size: 'elite', hp: T.elite, radius: 58, score: 1500, energy: 6,
        body: 'balloon', contact: true, chapter: 1, coins: 12,
        fire: [{ pattern: 'fan', interval: 2.2, speed: 200, kind: 'diamond', radius: 8, count: 5, spread: 56, delay: 1.2, windup: 0.5, muzzle: { x: 0, y: -40 } }],
        intro: '精英。两侧护盾发生器让本体刀枪不入，先打掉发生器。',
    },
    {
        id: 'anchorship-gen', name: '护盾发生器', frame: 'enemy/anchorship-gen', size: 'part', hp: T.elite * 0.22, radius: 18, score: 300, energy: 2,
        body: 'metal', chapter: 1, coins: 2,
        intro: '铁锚飞艇的护盾来源。',
    },
    // ── 通用 ──
    {
        id: 'carrier', name: '补给运输机', frame: 'enemy/carrier', size: 'medium', hp: T.medium * 1.1, radius: 36, score: 500, energy: 3,
        body: 'metal', contact: true, chapter: 0, coins: 3,
        intro: '运送零件的无武装运输机，击毁必掉零件。',
    },
    {
        id: 'mimic', name: '宝箱怪', frame: 'enemy/mimic', size: 'medium', hp: T.medium * 2.2, radius: 30, score: 1200, energy: 4,
        body: 'wood', contact: true, chapter: 0, coins: 30,
        intro: '偶尔出现、会逃跑的宝箱，击破掉落大量金币。',
    },
];

export const ENEMY_DEFS: Readonly<Record<string, EnemyDef>> = DEFS.concat(CH1_ENEMIES, CH2_ENEMIES, CH3_ENEMIES, CH4_ENEMIES, CH5_ENEMIES, CH6_ENEMIES).reduce((map, def) => {
    map[def.id] = def;
    return map;
}, {} as Record<string, EnemyDef>);

export function enemyDef(id: string): EnemyDef {
    const def = ENEMY_DEFS[id];
    if (!def) throw new Error(`Unknown enemy: ${id}`);
    return def;
}

/** Boss 与 Boss 部件的定义（图鉴、命中材质、血量单位在 Boss 脚本中指定）。 */
export function bossPartDef(id: string, name: string, frame: string, size: EnemySize, radius: number,
    body: EnemyDef['body'], chapter: number, intro: string): EnemyDef {
    const existing = ENEMY_DEFS[id];
    if (existing) return existing;
    const def: EnemyDef = { id, name, frame, size, hp: 1, radius, score: size === 'boss' ? 20000 : 1500, energy: size === 'boss' ? 0 : 15, body, chapter, intro, contact: size === 'boss' };
    (ENEMY_DEFS as Record<string, EnemyDef>)[id] = def;
    return def;
}
