import { Color } from 'cc';

/**
 * CyBlockBees（挡住蜜蜂）视觉与常量基线。
 *
 * 主题名称：`CyBlockBees · 蜂巢贴纸`
 * 设计关键词：晴空渐变 / 蜂巢六边形 / 奶油厚贴纸 / 深棕描边 / 蜂蜜黄
 *
 * 关卡与物理来自原作（X-Clash 内 CyBlockBees 1.0.118）。角色、机关、地形与云全部按本主题重绘：
 * 有机造型由 imagegen 生成后对齐原精灵轮廓，几何类精灵由 `restyle-art.py` 绘制，
 * 音效由 `build-audio.py` 合成，大厅封面由 `build-cover.py` 输出。
 * 页面构图、HUD 造型、选关与结算页由本项目自己定义并冻结，不继承大厅或其他小游戏。
 *
 * 造型语言取自狗头和蜜蜂的深棕描边：所有卡片、按钮和格子都是「厚贴纸」——
 * 深棕描边 + 底部同色系厚度，按下时整体下沉。选关用蜂巢六边形格子，
 * 主操作统一为蜂蜜黄，奶油色承载次要操作，薄荷色只用于未解锁状态，暖红只用于危险。
 * 天空是自上而下的青绿渐变，玩法页保持干净，只有云层；选关页额外有远山。
 * 动效只有轻微漂浮、弹出、翻页滑动和按压下沉；声音是木琴/钟琴式的圆润打击、卡通弹簧与气泡、毛茸茸的蜂鸣。
 */

export const CYBLOCKBEES_THEME_ID = 'cyblockbees-honeycomb-sticker-v3';

/** 远程资源 Bundle：`assets/game-assets/cyblockbees`。 */
export const CYBLOCKBEES_RESOURCE_BUNDLE = 'game-cyblockbees-assets';

/** 代码 Bundle：`assets/games/cyblockbees`。 */
export const CYBLOCKBEES_BUNDLE = 'game-cyblockbees';

export const CYBLOCKBEES_THEME = Object.freeze({
    id: CYBLOCKBEES_THEME_ID,
    name: 'CyBlockBees · 蜂巢贴纸',
    keywords: Object.freeze(['晴空渐变', '蜂巢六边形', '奶油厚贴纸', '深棕描边', '蜂蜜黄']),
});

export const CYBLOCKBEES_PALETTE = Object.freeze({
    /** 天空渐变；底色取自 `sky` 纹理，向上加深。 */
    skyTop: new Color(98, 200, 219, 255),
    skyBottom: new Color(196, 240, 226, 255),
    hillFar: new Color(150, 214, 170, 255),
    hillNear: new Color(118, 192, 120, 255),
    /** 通关进度。 */
    leaf: new Color(112, 186, 76, 255),
    /** 贴纸卡面与厚度。 */
    cream: new Color(255, 251, 238, 255),
    creamDeep: new Color(236, 218, 178, 255),
    /** 主色，取自 `honeycomb` 的蜂巢亮面。 */
    honey: new Color(255, 199, 64, 255),
    honeyLight: new Color(255, 230, 146, 255),
    honeyDeep: new Color(223, 145, 30, 255),
    /** 描边与正文，取自狗头轮廓的深棕。 */
    outline: new Color(96, 58, 32, 255),
    text: new Color(92, 56, 30, 255),
    textSoft: new Color(156, 116, 76, 255),
    /** 未解锁 / 禁用。 */
    mint: new Color(205, 236, 228, 255),
    mintDeep: new Color(150, 200, 190, 255),
    locked: new Color(108, 158, 150, 255),
    /** 原作画线使用黑色，非法尾段使用红色。 */
    ink: new Color(20, 19, 18, 255),
    /** 危险/失败，取自 `dici` 地刺的警示红。 */
    danger: new Color(232, 92, 72, 255),
    dangerDeep: new Color(176, 58, 44, 255),
    white: new Color(255, 255, 255, 255),
    shade: new Color(46, 30, 16, 156),
    glow: new Color(255, 246, 196, 120),
});

/** 字号层级：标题 / 大数字 / 小标题 / 正文 / 说明 / 角标。 */
export const CYBLOCKBEES_TYPE = Object.freeze({
    title: 60,
    number: 44,
    subtitle: 34,
    body: 28,
    caption: 24,
    badge: 20,
});

/**
 * 玩法常量来自原作 Lua（提取方式见 project-scripts/cyblockbees/README.md）：
 *
 * - 计时：`cyblockbees_comp_level:Start`，有蜂巢 10 秒、无蜂巢 6 秒；
 *   `tiny_stand_alone_mgr` 的 cngn 分支在前 8 关把有蜂巢的情况改成 8 秒。
 * - 画线采样间距：`cyblockbees_comp_drawLine` 用距离平方 .02 作阈值，
 *   非法判定用 `Physics2D.OverlapCircle(..., 0.035, layers)` 与 `Linecast`。
 * - 浮力：`cyblockbees_comp_water`，`buoyancyForce = 0.8 * 1.5`，12 段积分。
 */
export const CYBLOCKBEES_RULES = Object.freeze({
    /** 有蜂巢时的关卡时长（秒）。 */
    timeWithHive: 10,
    /** 无蜂巢时的关卡时长（秒）。 */
    timeWithoutHive: 6,
    /** 画线采样点之间的最小间距（世界单位）。 */
    minSegmentDistance: Math.sqrt(.02),
    /** 落笔非法判定的圆半径（世界单位）。 */
    illegalProbeRadius: 0.035,
    /** 水的浮力系数。 */
    waterBuoyancy: 1.2,
    /** 水的积分段数。 */
    waterSplits: 12,
    /** 原作 enemy 在追踪阶段直接设置速度为 4 世界单位/秒。 */
    beeSpeed: 4,
    /** 原包 globalgamemanagers / TimeManager 的固定步长；单次 AddForce 按此积分。 */
    beeContactTimeStep: .01,
    /** 与原包 TimeManager 一致；缩小蜂群推动复合刚体时的接触穿透。 */
    physicsTimeStep: .01,
    /** 原包 TimeManager.Maximum Allowed Timestep；游戏计时和物理使用同一上限。 */
    maxFrameDelta: .1,
    /** 速度迭代沿用原包；Cocos 的复合碰撞体需要保留本后端的位置迭代精度。 */
    velocityIterations: 8,
    positionIterations: 10,
});

/** 元素种类 -> 精灵 slug（见 `CyBlockBeesSprites.ts`）。多帧的用数组顺序播放。 */
export const CYBLOCKBEES_KIND_SPRITES: Readonly<Record<string, string | readonly string[]>> =
    Object.freeze({
        dog: 'dog-idle',
        hive: Object.freeze(['hive-a', 'hive-b']),
        water: 'water',
        cloud: Object.freeze(['cloud-1', 'cloud-2', 'cloud-3']),
        drawGround: 'ground',
        drawRedArea: 'solid-red',
        drawBox: 'box-inner',
        drawBoxMid: 'box-inner',
        drawBoxLong: 'box-inner',
        box: Object.freeze(['box-1', 'box-2', 'box-3']),
        ice: Object.freeze(['ice-1', 'ice-2', 'ice-3']),
        spike: 'spike',
        saw: 'saw-gear',
        brick: Object.freeze(['brick-1', 'brick-2']),
        balloon: 'ball',
        balloonDog: 'ball',
        balloonBomb: 'bomb',
        balloonSaw: 'saw-gear',
        balloonHive: 'hive-a',
        balloonRope: 'ball',
        bomb: 'bomb',
        knife: 'knife',
        wind: 'fx-wind',
        spider: Object.freeze(['spider-1', 'spider-2', 'spider-3', 'spider-4', 'spider-5', 'spider-6']),
        stone: 'stone',
        jelly: 'box-inner',
        moveable: 'move-arrow',
        blackHole: 'black-hole',
        ciqiu: 'spiky-ball-1',
        ciqiuJoint: 'spiky-ball-2',
        round: 'platform-round',
        platform: 'platform-cube',
        moveableBrick: 'brick-1',
        grass: Object.freeze(['grass-1', 'grass-2', 'grass-3']),
        tree: 'tree',
        hand: 'hand',
        solidRed: 'solid-red',
    });
