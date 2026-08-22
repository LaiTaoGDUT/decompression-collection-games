/**
 * 全局玩法数值（策划案 §6/§8/§10/§11）。
 * 所有可调参数集中在此，禁止在系统与视图里散落魔法数。
 */
export const ENDLESS_SWORD_CONFIG = Object.freeze({
    player: Object.freeze({
        maxHp: 100,
        moveSpeed: 320,
        hurtInvincibleSeconds: 0.45,
    }),
    /** 玩家序列帧（策划案 §86：4×4，行序 向下/向左/向右/向上，每行 4 帧）。 */
    playerSprite: Object.freeze({
        texturePath: 'visual/player/cultivator-v1/texture',
        frameWidth: 256,
        frameHeight: 256,
        rowCount: 4,
        frameCount: 4,
        /** 帧在场景中的等比显示边长（正方形帧，96 = 0.375 倍原始尺寸）。 */
        displaySize: 96,
        walkFramesPerSecond: 6,
        /** 静止时显示的帧下标（第二/四帧为并拢姿态，禁止停在迈步帧）。 */
        idleFrameIndex: 1,
        /** 脚底椭圆阴影：半径与纵向偏移（相对玩家节点原点，向下为负）。 */
        shadowRadiusX: 26,
        shadowRadiusY: 9,
        shadowOffsetY: -44,
        /**
         * 碰撞盒定义在单帧坐标系下（2026-08-22 用户定义）：
         * 宽 60 × 高 120，在 256×256 帧内垂直水平居中。
         */
        hitboxWidth: 60,
        hitboxHeight: 120,
    }),
    joystick: Object.freeze({
        radius: 88,
        deadZone: 12,
        /** 隐藏摇杆视觉：仍可操控但不绘制底座与旋钮。 */
        showVisuals: false,
    }),
    world: Object.freeze({
        tileSize: 1024,
        tileGrid: 3,
    }),
    loop: Object.freeze({
        logicHz: 30,
        maxFrameSeconds: 0.25,
        maxCatchUpSteps: 8,
    }),
    /** 策划案 §71：生存分每秒 +10。 */
    survivalScorePerSecond: 10,
});

/** 世界坐标下的玩家碰撞盒：帧内 hitbox 按显示缩放等比换算。 */
export function getPlayerWorldHitbox(): { width: number; height: number } {
    const sprite = ENDLESS_SWORD_CONFIG.playerSprite;
    const scale = sprite.displaySize / sprite.frameWidth;
    return {
        width: sprite.hitboxWidth * scale,
        height: sprite.hitboxHeight * scale,
    };
}
