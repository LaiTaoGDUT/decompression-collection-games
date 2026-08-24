import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { RunModel } from '../core/RunModel';
import type { MoveInput } from '../EndlessSwordTypes';

/**
 * 玩家移动系统（策划案 §6.2）：
 * 死区内不移动；越过死区后使用统一移速，方向由输入向量决定。
 */
export class PlayerSystem {
    constructor(private readonly model: RunModel) {}

    step(input: MoveInput, dt: number): void {
        const player = this.model.player;
        player.invincibilityRemaining = Math.max(0, player.invincibilityRemaining - dt);
        player.moveDirX = input.dirX;
        player.moveDirY = input.dirY;
        player.moveMagnitude = input.magnitude;
        if (input.magnitude > 0) {
            player.facingX = input.dirX;
            player.facingY = input.dirY;
        }
        const speed = ENDLESS_SWORD_CONFIG.player.moveSpeed
            * this.model.moveSpeedMultiplier
            * input.magnitude;
        player.x += input.dirX * speed * dt;
        player.y += input.dirY * speed * dt;
    }
}
