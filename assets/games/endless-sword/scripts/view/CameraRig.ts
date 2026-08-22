import type { Node } from 'cc';

/**
 * 玩家中心摄像机（策划案 §7）。
 * M1 用世界根节点反向平移实现跟随（玩家恒在屏幕中心）；
 * M3 在此扩展震屏（上限 16px，策划案 §102）。
 */
export class CameraRig {
    constructor(private readonly worldRoot: Node) {}

    follow(renderX: number, renderY: number): void {
        this.worldRoot.setPosition(-renderX, -renderY, 0);
    }
}
