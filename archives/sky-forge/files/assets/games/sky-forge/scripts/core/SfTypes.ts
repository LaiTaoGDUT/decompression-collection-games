import type { SlotId } from './SfBalance';

export type PlaneId =
    | 'vanguard' | 'thunder' | 'falcon' | 'lightning' | 'frost' | 'phantom'
    | 'dawn' | 'wildgoose' | 'blackhole' | 'swordfish' | 'dragon' | 'chakram';

export type BossTier = 'small' | 'mid' | 'big' | 'hidden';

export interface Vec { x: number; y: number }

/** 我方子弹。damage 已经包含所有倍率；kind 对应弹体图集里的帧名。 */
export interface PlayerBullet {
    id: number;
    x: number; y: number;
    vx: number; vy: number;
    radius: number;
    damage: number;
    kind: string;
    /** 剩余可穿透次数；0 = 命中即消失。 */
    pierce: number;
    life: number;
    /** 追踪目标与转向速度（弧度/秒）。 */
    target?: number;
    turn?: number;
    speed?: number;
    /** 命中时的范围伤害。 */
    splash?: number;
    splashRatio?: number;
    /** 来源挂点；被击中的敌人记录最后一次来源，用于机制结算。 */
    slot: SlotId | 'ultimate' | 'mechanic';
    hitIds?: number[];
    dead?: boolean;
    /** 视觉用：缩放与旋转是否跟随速度方向。 */
    scale?: number;
    spin?: number;
    angle?: number;
    tag?: string;
    /** 穿过虚空裂缝后的冷却秒数（防止在一对裂缝之间来回传送）。 */
    warp?: number;
}

export interface EnemyBullet {
    id: number;
    x: number; y: number;
    vx: number; vy: number;
    ax: number; ay: number;
    radius: number;
    kind: string;
    life: number;
    /** 出生后停顿的秒数（停顿期间不移动，有预警闪烁）。 */
    delay: number;
    /** 每秒转向角（弧度）。 */
    turn: number;
    maxSpeed: number;
    grazed: boolean;
    /** 到期后炸开：count 方向、速度、种类。 */
    fuse?: number;
    burst?: { count: number; speed: number; kind: string; radius: number; offset?: number };
    /** 到期落地后留下熔岩滩或冰面（随地面卷动，radius 半径、life 秒；kind 默认 lava）。 */
    pool?: { radius: number; life: number; kind?: 'lava' | 'ice' };
    /** 碰到屏幕左右边时反弹的剩余次数（弹墙子弹）。 */
    bounces?: number;
    /** 冻结：再飞 stop 秒后原地停住（配合 fuse + burst 做“冻结 → 碎裂”）。 */
    stop?: number;
    /** 公转弹：绕 (cx, cy) 以角速度 w 公转，半径每秒变化 dr（负值收缩，半径到 0 消失）。设置后忽略速度。 */
    orbit?: { cx: number; cy: number; r: number; a: number; w: number; dr: number };
    /** 穿过虚空裂缝后的冷却秒数。 */
    warp?: number;
    /** 抛射中（lob）：在空中飞行，不会打中玩家，也不算擦弹；落地后由 pool / burst 生效。 */
    lofted?: boolean;
    dead?: boolean;
    angle: number;
}

/**
 * 场地危险物：由敌人 / Boss / 关卡规则在每个模拟步登记，视图绘制，战斗核心统一判定。
 * - laser / vine：线段光束，预警结束后碰到即受伤；
 * - net：线段拖网，挡住我方子弹；
 * - web：圆形蛛网，玩家在里面移动减速；
 * - path：飞行路线虚线（线段，width 为线宽），只做显示；warn > 0 时为预告阶段（由淡到实）；
 * - thread：垂丝，只做显示；
 * - lava：圆形熔岩滩（以 a 为圆心、width 为半径），预警结束后玩家进入即受伤；
 * - fissure：熔岩裂缝（线段），预警结束后碰到即受伤；
 * - tongue：舌头横扫（线段），判定同激光；
 * - rail：矿车轨道（线段），只做显示，预警期间高亮；
 * - mark：落点阴影圈（以 a 为圆心、width 为半径），只做显示，warn 越小圈越实；
 * - icewall：冰墙（线段），同时挡住敌我子弹，玩家可以躲在墙后；
 * - ice：冰面（以 a 为圆心、width 为半径），玩家在上面移动带惯性滑行；
 * - pulse：环形脉冲波（以 a 为圆心、radius 为当前半径、width 为环带半宽），每秒扩大 speed，
 *   gap 方向留出 ±gapWidth 弧度的缺口，玩家只能从缺口穿过；
 * - tractor：牵引光束（a 为光源，b 为光束末端，width 为半宽），玩家在光束里被以 pull 像素/秒拉向光源，
 *   同时我方火力 +30%；
 * - portal：一对虚空裂缝（a、b 为两端圆心，width 为半径），敌我子弹从一端进入、从另一端以原速度射出；
 * - well：引力井（以 a 为圆心、width 为影响半径），把经过的敌我子弹向圆心弯曲（pull 为弯曲强度），
 *   drag 不为 0 时还会把玩家以 drag 像素/秒拉向圆心（负值为排斥）；
 * - zone：矩形预警区（a、b 为对角），只做显示。
 */
export interface Hazard {
    kind: 'laser' | 'vine' | 'net' | 'web' | 'path' | 'thread' | 'lava' | 'fissure' | 'tongue' | 'rail' | 'mark' | 'icewall' | 'ice'
        | 'pulse' | 'tractor' | 'portal' | 'well' | 'zone';
    ax: number; ay: number; bx: number; by: number;
    /** 线段类为判定半宽；光锥为光斑半宽；蛛网为半径（以 a 为圆心）。 */
    width: number;
    /** 预警剩余比例（0～1，> 0 时只显示、不判定）。 */
    warn?: number;
    /** 持续秒数：设置后保留到时间耗尽；未设置的只存在一个模拟步，由登记者每步重新登记。 */
    life?: number;
    maxLife?: number;
    /** 属于地面：每个模拟步随背景卷动下移。 */
    scroll?: boolean;
    /** 持续型危险物的预警秒数：设置后 warn 由核心从 1 自动递减到 0。 */
    warnTime?: number;
    /** 脉冲波：当前半径、每秒扩大量、缺口方向与缺口半角（弧度）。 */
    radius?: number;
    speed?: number;
    gap?: number;
    gapWidth?: number;
    /** 牵引光束的拉力（像素/秒）；引力井的子弹弯曲强度。 */
    pull?: number;
    /** 引力井拉动玩家的速度（像素/秒，负值为排斥）。 */
    drag?: number;
    /** 显示色（落点圈、预警区等；未设置用默认色）。 */
    tint?: string;
}

export type PickupKind = 'main' | 'wing' | 'special' | 'fire' | 'repair' | 'coin' | 'coinBig';

export interface Pickup {
    id: number;
    kind: PickupKind;
    x: number; y: number;
    vx: number; vy: number;
    age: number;
    life: number;
    /** 被击中弹飞的零件：落地后永久保留；level 为脱落的那一级（视图显示对应零件图）。 */
    lost?: boolean;
    level?: number;
    /** 弹飞的起点与落点（设计像素）。 */
    sx?: number; sy?: number;
    tx?: number; ty?: number;
    magnet: boolean;
    dead?: boolean;
}

export type CombatEventType =
    | 'shot' | 'weapon-fire' | 'hit' | 'kill' | 'chain' | 'graze' | 'hurt' | 'dead' | 'revive'
    | 'pickup' | 'assemble-start' | 'assemble' | 'part-lost' | 'part-full'
    | 'fire-buff' | 'repair' | 'coin'
    | 'ultimate' | 'ultimate-end' | 'energy-full'
    | 'boss-warning' | 'boss-enter' | 'boss-phase' | 'boss-part' | 'boss-defeated' | 'boss-attack'
    | 'level-intro' | 'level-clear' | 'level-exit' | 'explosion' | 'telegraph' | 'shield-hit'
    | 'enemy-spawn' | 'lock' | 'missile' | 'combo' | 'score' | 'sector'
    /** 落雷：strike-warn 在 x 处预警 value 秒，strike 为实际落雷（关卡规则 storm 使用）。 */
    | 'strike-warn' | 'strike';

export interface CombatEvent {
    type: CombatEventType;
    x?: number;
    y?: number;
    value?: number;
    size?: number;
    kind?: string;
    slot?: SlotId;
    text?: string;
    id?: number;
    angle?: number;
    /** 击杀结算：金币、短时连杀数（0.72 秒内连续击坠）、体型档。 */
    coins?: number;
    chain?: number;
    tier?: number;
}
