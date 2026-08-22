/**
 * 全局玩法数值（策划案 §6/§8/§10/§11）。
 * 所有可调参数集中在此，禁止在系统与视图里散落魔法数。
 */
export const ENDLESS_SWORD_CONFIG = Object.freeze({
    player: Object.freeze({
        maxHp: 100,
        moveSpeed: 320,
        collisionRadius: 26,
        hurtInvincibleSeconds: 0.45,
    }),
    joystick: Object.freeze({
        radius: 88,
        deadZone: 12,
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
