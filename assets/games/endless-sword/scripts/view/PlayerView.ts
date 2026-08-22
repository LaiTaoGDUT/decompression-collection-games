import { Color, Graphics, Layers, Node } from 'cc';

/**
 * 玩家占位视图：无名修士的几何简化表现（青白道袍 + 金腰带 + 剑匣 + 灵气环）。
 * M4 替换为正式 Sprite Sheet（策划案 §86）。
 */
export class PlayerView {
    readonly node: Node;

    constructor(parent: Node) {
        const node = new Node('Player');
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        const g = node.addComponent(Graphics);

        // 灵气环（最底层光晕）
        g.strokeColor = new Color(100, 214, 180, 90);
        g.lineWidth = 2;
        g.circle(0, 0, 34);
        g.stroke();

        // 背后剑匣（顶端露出道袍外）
        g.fillColor = new Color(40, 60, 52, 255);
        g.roundRect(-10, 8, 20, 28, 6);
        g.fill();

        // 青白道袍主体
        g.fillColor = new Color(207, 232, 220, 255);
        g.circle(0, 0, 26);
        g.fill();

        // 金腰带
        g.fillColor = new Color(231, 198, 106, 255);
        g.rect(-26, -8, 52, 9);
        g.fill();

        // 深色描边
        g.strokeColor = new Color(16, 24, 23, 255);
        g.lineWidth = 3;
        g.circle(0, 0, 26);
        g.stroke();

        this.node = node;
    }

    setWorldPosition(x: number, y: number): void {
        this.node.setPosition(x, y, 0);
    }

    destroy(): void {
        if (this.node.isValid) {
            this.node.destroy();
        }
    }
}
