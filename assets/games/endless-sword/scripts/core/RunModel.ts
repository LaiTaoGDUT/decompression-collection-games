import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';

/** 玩家单局可变状态（策划案 §10）。prev* 供渲染插值使用。 */
export interface PlayerModel {
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    moveDirX: number;
    moveDirY: number;
    moveMagnitude: number;
    facingX: number;
    facingY: number;
    hp: number;
    invincibilityRemaining: number;
}

/**
 * 单局可变状态（策划案 §4/§5）。系统只写 Model，视图只读 Model；
 * 游戏状态机（RunState）由入口组件持有，本类不重复。
 */
export class RunModel {
    runSeed = 0;
    gameplayElapsedTime = 0;
    combatScore = 0;
    kills = 0;
    readonly player: PlayerModel = createPlayer();

    reset(seed: number): void {
        this.runSeed = seed;
        this.gameplayElapsedTime = 0;
        this.combatScore = 0;
        this.kills = 0;
        const player = this.player;
        player.x = 0;
        player.y = 0;
        player.prevX = 0;
        player.prevY = 0;
        player.moveDirX = 0;
        player.moveDirY = 0;
        player.moveMagnitude = 0;
        player.facingX = 0;
        player.facingY = -1;
        player.hp = ENDLESS_SWORD_CONFIG.player.maxHp;
        player.invincibilityRemaining = 0;
    }

    /** 每个逻辑步开始前记录上一帧位置，供渲染插值。 */
    beginLogicStep(): void {
        const player = this.player;
        player.prevX = player.x;
        player.prevY = player.y;
    }

    /** 渲染插值位置：alpha ∈ [0,1)。 */
    lerpPlayer(alpha: number): { x: number; y: number } {
        const player = this.player;
        return {
            x: player.prevX + (player.x - player.prevX) * alpha,
            y: player.prevY + (player.y - player.prevY) * alpha,
        };
    }

    get survivalScore(): number {
        return Math.floor(this.gameplayElapsedTime * ENDLESS_SWORD_CONFIG.survivalScorePerSecond);
    }

    get totalScore(): number {
        return this.survivalScore + this.combatScore;
    }
}

function createPlayer(): PlayerModel {
    return {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        moveDirX: 0,
        moveDirY: 0,
        moveMagnitude: 0,
        facingX: 0,
        facingY: -1,
        hp: ENDLESS_SWORD_CONFIG.player.maxHp,
        invincibilityRemaining: 0,
    };
}
