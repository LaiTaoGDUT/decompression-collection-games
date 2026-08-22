import { ENDLESS_SWORD_CONFIG } from '../config/GameConfig';
import type { RunModel } from '../core/RunModel';
import type { MoveInput } from '../view/FloatingJoystick';

/**
 * 玩家移动系统（策划案 §6.2）：
 * 死区内不移动；12～88px 线性映射到 0%～100% 移速。
 */
export class PlayerSystem {
    constructor(private readonly model: RunModel) {}

    step(input: MoveInput, dt: number): void {
        const player = this.model.player;
        player.moveDirX = input.dirX;
        player.moveDirY = input.dirY;
        player.moveMagnitude = input.magnitude;
        if (input.magnitude > 0) {
            player.facingX = input.dirX;
            player.facingY = input.dirY;
        }
        const speed = ENDLESS_SWORD_CONFIG.player.moveSpeed * input.magnitude;
        player.x += input.dirX * speed * dt;
        player.y += input.dirY * speed * dt;
    }
}
